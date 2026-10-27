import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("address upgrade preserves URLs, allocates unique routes, protects drafts and respects publication entitlement", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
      grant usage on schema auth,public,storage to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .sort()
      .filter((f) => f.endsWith(".sql") && !f.includes("address_urls"))) {
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    }
    await db.query(
      "insert into auth.users(id,email) values($1,'first@example.com'),($2,'second@example.com')",
      [owner, other],
    );
    await db.exec(
      "update profiles set name='Listing Agent',phone='+12025550148'",
    );
    await db.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images,status) values($1,$2,'old-public-home','Palm Residence','A home with ample space and lovely natural light.','123 Palm Drive, Beverly Hills, CA',2450000,3250,array['https://example.com/home.jpg'],'published')",
      [id, owner],
    );
    const migration = await readFile(
      new URL("202610270001_address_urls.sql", directory),
      "utf8",
    );
    await db.exec(`begin; ${migration} commit;`);
    await db.exec(`begin; ${migration} commit;`);
    const row = async (listing = id) =>
      (
        await db.query<{
          slug: string;
          address_slug: string;
          location: string;
        }>("select slug,address_slug,location from properties where id=$1", [
          listing,
        ])
      ).rows[0];
    assert.equal((await row()).address_slug, "123-palm-drive-beverly-hills-ca");
    assert.equal((await row()).slug, "old-public-home");
    assert.equal(
      (
        await db.query<{ v: string }>(
          "select address_slug_base('Șoseaua Éroilor, nr. 12 / București!') v",
        )
      ).rows[0].v,
      "soseaua-eroilor-nr-12-bucuresti",
    );
    await db.exec(`set role authenticated; set app.user_id='${other}'`);
    await db.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images,status,address_slug) values($1,$2,'second-home','Second residence','Another home with ample space and lovely natural light.','123 Palm Drive, Beverly Hills, CA',2450000,3250,array['https://example.com/home.jpg'],'published','stolen-link')",
      [id2, other],
    );
    assert.equal(
      (await row(id2)).address_slug,
      "123-palm-drive-beverly-hills-ca-2",
    );
    await assert.rejects(
      db.query("select * from property_url_slugs"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("insert into property_url_slugs values('hijack',$1)", [id2]),
      /permission denied/i,
    );
    await db.query(
      "update properties set address_slug='stolen-link' where id=$1",
      [id2],
    );
    assert.equal(
      (await row(id2)).address_slug,
      "123-palm-drive-beverly-hills-ca-2",
    );
    await db.query("update properties set location='Dashboard' where id=$1", [
      id2,
    ]);
    assert.equal((await row(id2)).address_slug, "dashboard-property");
    await db.query(
      "update properties set status='draft',location='456 Ocean Avenue' where id=$1",
      [id2],
    );
    await db.query("update properties set status='published' where id=$1", [
      id2,
    ]);
    assert.equal((await row(id2)).address_slug, "456-ocean-avenue");
    await db.exec("reset role; set role anon");
    for (const slug of [
      "second-home",
      "123-palm-drive-beverly-hills-ca-2",
      "dashboard-property",
      "456-ocean-avenue",
    ]) {
      const result = (
        await db.query<{ v: any }>("select get_public_property($1) v", [slug])
      ).rows[0].v;
      assert.equal(result.property.id, id2);
      assert.equal(result.property.address_slug, "456-ocean-avenue");
      assert.equal(result.property.owner_id, undefined);
    }
    // Contact forms keep the immutable property slug, even after an address changes.
    assert.equal(
      (
        await db.query<{ v: string }>(
          "select submit_property_inquiry('second-home','Alex Buyer','alex@example.com','','Please arrange a property viewing.') v",
        )
      ).rows[0].v,
      "received",
    );
    await db.exec(
      `reset role; set role authenticated; set app.user_id='${other}'`,
    );
    await db.query("update properties set status='draft' where id=$1", [id2]);
    await db.exec("reset role; set role anon");
    assert.equal(
      (
        await db.query<{ v: unknown }>(
          "select get_public_property('456-ocean-avenue') v",
        )
      ).rows[0].v,
      null,
    );
    assert.equal(
      (
        await db.query<{ v: unknown }>(
          "select get_public_property('second-home') v",
        )
      ).rows[0].v,
      null,
    );
    await db.exec("reset role; select activate_property_billing()");
    await db.exec(`set role authenticated; set app.user_id='${other}'`);
    await assert.rejects(
      db.query("update properties set status='published' where id=$1", [id2]),
      /PAYMENT_REQUIRED/,
    );
    await db.exec("reset role");
    await db.query("select grant_platform_admin('first@example.com')");
    const result = (
      await db.query<{ v: any }>(
        "select admin_publish_property($1,$2,'Admin publication') v",
        [id2, owner],
      )
    ).rows[0].v;
    assert.equal(result.publicPath, "/456-ocean-avenue");
    assert.equal(result.published, true);
    // Removing a listing removes all aliases; it never exposes a different private listing.
    await db.query("delete from properties where id=$1", [id2]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from property_url_slugs where property_id=$1",
          [id2],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
