import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  removeStorageTree,
  validateCleanupJob,
  runAccountCleanup,
} from "../src/lib/account-cleanup";

const actor = "11111111-1111-4111-8111-111111111111",
  owner = "22222222-2222-4222-8222-222222222222";
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("lifecycle SQL protects paid/published listings, expires abandoned drafts and durably scopes administrative deletion", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
   grant usage on schema auth,public,storage to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant select,insert,delete on storage.objects to authenticated;
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
    await db.exec(
      await readFile(
        new URL("../supabase/sql-editor-setup.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/sql-editor-account-lifecycle.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query(
      "insert into auth.users(id,email) values($1,'admin@example.com'),($2,'agent@example.com')",
      [actor, owner],
    );
    assert.deepEqual(
      (
        await db.query<any>(
          "select profile_completed_at from profiles where id=$1",
          [owner],
        )
      ).rows[0].profile_completed_at,
      null,
    );
    await db.exec(
      "update profiles set name='Agent',phone='+1 555 123 4567'; select grant_platform_admin('admin@example.com');",
    );
    const completed = (
      await db.query<any>(
        "select profile_completed_at from profiles where id=$1",
        [owner],
      )
    ).rows[0].profile_completed_at;
    await db.query(
      "update profiles set profile_completed_at=null where id=$1",
      [owner],
    );
    assert.deepEqual(
      (
        await db.query<any>(
          "select profile_completed_at from profiles where id=$1",
          [owner],
        )
      ).rows[0].profile_completed_at,
      completed,
    );
    const add = async (id: string, slug: string) =>
      db.query(
        "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,$3,'A home','A detailed description of this beautiful property.','Austin',500000,1500,array['https://example.com/front.jpg'])",
        [id, owner, slug],
      );
    const pending = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const paid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await add(pending, "pending-home");
    await add(paid, "paid-but-not-published");
    await db.query("select reserve_property_order($1,$2)", [pending, owner]);
    await db.query("select reserve_property_order($1,$2)", [paid, owner]);
    await db.query(
      "update property_orders set status='paid',paid_at=now() where property_id=$1",
      [paid],
    );
    await assert.rejects(
      db.query("select admin_delete_property($1,$2)", [pending, actor]),
    );
    await assert.rejects(
      db.query("select admin_delete_account($1,$2)", [owner, actor]),
    );
    await add(first, "unpublished-home");
    await add(second, "paid-home");
    const expiry = (
      await db.query<any>(
        "select draft_expires_at from properties where id=$1",
        [first],
      )
    ).rows[0].draft_expires_at;
    await db.query(
      "update properties set draft_expires_at=now()+interval '100 years' where id=$1",
      [first],
    );
    assert.deepEqual(
      (
        await db.query<any>(
          "select draft_expires_at from properties where id=$1",
          [first],
        )
      ).rows[0].draft_expires_at,
      expiry,
    );
    await db.query("select admin_publish_property($1,$2,$3)", [
      second,
      actor,
      "Approved",
    ]);
    await db.query("update properties set status='draft' where id=$1", [
      second,
    ]);
    // Simulate the clock passing without allowing a client to modify retention.
    await db.exec(
      "alter table properties disable trigger guard_property_lifecycle; update properties set draft_expires_at=now()-interval '1 day'; alter table properties enable trigger guard_property_lifecycle;",
    );
    await db.exec("select expire_unpublished_properties()");
    assert.equal(
      (await db.query("select id from properties where id=$1", [first])).rows
        .length,
      0,
    );
    assert.equal(
      (await db.query("select id from properties where id=$1", [second])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select id from properties where id=$1", [pending])).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select id from properties where id=$1", [paid])).rows
        .length,
      1,
    );
    await db.query(
      "update property_orders set expires_at=now()-interval '1 hour' where property_id=$1",
      [pending],
    );
    let jobs = (await db.query<any>("select * from account_cleanup_jobs")).rows;
    assert.deepEqual(jobs[0].paths, [
      { bucket: "property-images", prefix: `${owner}/${first}` },
    ]);
    await assert.rejects(
      db.query("select admin_delete_account($1,$2)", [actor, actor]),
    );
    await assert.rejects(
      db.query("select admin_delete_account($1,$2)", [actor, owner]),
    );
    await db.exec(
      "set role authenticated; select set_config('app.user_id','" +
        owner +
        "',false)",
    );
    await assert.rejects(db.exec("select expire_unpublished_properties()"));
    await assert.rejects(
      db.query("select admin_delete_property($1,$2)", [second, actor]),
    );
    await db.exec("reset role");
    await db.query("select admin_delete_account($1,$2)", [owner, actor]);
    assert.equal(
      (await db.query("select id from properties where owner_id=$1", [owner]))
        .rows.length,
      0,
    );
    await assert.rejects(add(first, "cannot-recreate"));
    const account = (
      await db.query<any>(
        "select * from account_cleanup_jobs where kind='account'",
      )
    ).rows[0];
    assert.equal(account.paths.length, 4);
    account.paths.forEach((p: any) => assert.equal(p.prefix, owner));
    const propertyJob = (
      await db.query<any>(
        "select * from account_cleanup_jobs where target_id=$1",
        [second],
      )
    ).rows[0];
    assert.equal(propertyJob.paths.length, 3);
    await db.exec(
      "set role authenticated; select set_config('app.user_id','" +
        owner +
        "',false)",
    );
    assert.equal(
      (await db.query<any>("select account_accepts_uploads() as ok")).rows[0]
        .ok,
      false,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('agent-avatars',$1)",
        [owner + "/new.jpg"],
      ),
    );
    await db.exec("reset role");
    await db.exec(
      "update account_cleanup_jobs set next_attempt_at=now()-interval '1 minute'",
    );
    const lease = crypto.randomUUID();
    const claimed = (
      await db.query<any>("select claim_account_cleanup($1) as job", [lease])
    ).rows[0].job;
    assert.ok(claimed.id);
    const other = (
      await db.query<any>("select claim_account_cleanup($1) as job", [
        crypto.randomUUID(),
      ])
    ).rows[0].job;
    assert.notEqual(other.id, claimed.id);
    assert.equal(
      (
        await db.query<any>(
          "select finish_account_cleanup($1,$2,true,false) as ok",
          [claimed.id, crypto.randomUUID()],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query<any>(
          "select finish_account_cleanup($1,$2,true,false) as ok",
          [claimed.id, lease],
        )
      ).rows[0].ok,
      true,
    );
    await db.query("delete from auth.users where id=$1", [owner]);
    assert.ok(
      (
        await db.query(
          "select id from account_cleanup_jobs where owner_id=$1",
          [owner],
        )
      ).rows.length >= 3,
    );
  } finally {
    await db.close();
  }
});

test("storage cleanup recurses and drains page zero without skipping files or touching another owner", async () => {
  const files = new Set(
    Array.from(
      { length: 230 },
      (_, i) => `${owner}/${first}/generation/raw-${i}.mp4`,
    ),
  );
  files.add(`${actor}/${first}/keep.mp4`);
  const removed: string[] = [];
  const db = {
    storage: {
      from: () => ({
        list: async (prefix: string, { offset, limit }: any) => {
          assert.equal(offset, 0);
          const children = new Map<string, any>();
          for (const path of files)
            if (path.startsWith(prefix + "/")) {
              const name = path.slice(prefix.length + 1).split("/")[0];
              children.set(name, {
                name,
                id: path === prefix + "/" + name ? "file-id" : null,
              });
            }
          return { data: [...children.values()].slice(0, limit), error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) {
            assert.ok(path.startsWith(owner + "/"));
            removed.push(path);
            files.delete(path);
          }
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  assert.equal(
    await removeStorageTree(
      db,
      "property-video-work",
      owner,
      Date.now() + 5000,
    ),
    true,
  );
  assert.equal(removed.length, 230);
  assert.deepEqual([...files], [`${actor}/${first}/keep.mp4`]);
  assert.equal(
    await removeStorageTree(db, "property-video-work", owner, Date.now() - 1),
    false,
  );
});

test("cleanup validates boundaries and preserves failed work without deleting Auth prematurely", async () => {
  const job = {
    id: first,
    kind: "account" as const,
    target_id: owner,
    owner_id: owner,
    paths: [{ bucket: "property-images", prefix: owner }],
  };
  validateCleanupJob(job);
  for (const invalid of [
    { ...job, paths: [{ bucket: "property-images", prefix: actor }] },
    { ...job, paths: [{ bucket: "property-images", prefix: owner + "/../" }] },
    { ...job, paths: [{ bucket: "unknown", prefix: owner }] },
  ])
    assert.throws(() => validateCleanupJob(invalid));
  let claimed = false,
    deleted = false,
    checkpoint: any;
  const db = {
    rpc: async (name: string, args: any) => {
      if (name === "expire_unpublished_properties")
        return { data: 0, error: null };
      if (name === "claim_account_cleanup") {
        const data = claimed ? null : job;
        claimed = true;
        return { data, error: null };
      }
      checkpoint = args;
      return { data: true, error: null };
    },
    auth: {
      admin: {
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => {
          deleted = true;
          return { error: null };
        },
      },
    },
    storage: {
      from: () => ({
        list: async () => ({
          data: null,
          error: new Error("Storage unavailable"),
        }),
      }),
    },
  } as unknown as SupabaseClient;
  await runAccountCleanup(db);
  assert.equal(deleted, false);
  assert.equal(checkpoint.p_done, false);
  assert.equal(checkpoint.p_failed, true);
});
