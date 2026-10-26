import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { validateInquiry } from "../src/lib/validation";

// Real PostgreSQL semantics in WASM; only Supabase-owned auth/storage scaffolding
// is stubbed. This does not replace a staging test against Supabase Auth/Storage.
let db: PGlite;
const agentA = "11111111-1111-4111-8111-111111111111";
const agentB = "22222222-2222-4222-8222-222222222222";
const propertyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function asAgent(id: string) {
  await db.exec(
    `reset role; set role authenticated; set app.user_id = '${id}';`,
  );
}
async function asAnon() {
  await db.exec("reset role; set role anon; set app.user_id = ''; ");
}

async function createTestDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
    grant usage on schema auth, public, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
  `);
  return database;
}

before(async () => {
  db = await createTestDatabase();
  const migration = await readFile(
    new URL("../supabase/sql-editor-setup.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values ($1,'a@example.com','{\"name\":\"Agent A\"}'), ($2,'b@example.com','{\"name\":\"Agent B\"}')",
    [agentA, agentB],
  );
  await db.exec("update public.profiles set phone = '+1 202 555 0148';");
  await asAgent(agentA);
  await db.query(
    "insert into public.properties(id,owner_id,slug,title,description,location,price,area,images,status) values ($1,$2,'published-home','A beautiful home','A long and meaningful description of a lovely home.','Austin, TX',500000,2000,array['https://example.com/home.jpg'],'published')",
    [propertyA, agentA],
  );
  await asAgent(agentB);
  await db.query(
    "insert into public.properties(id,owner_id,slug) values ($1,$2,'private-draft')",
    [propertyB, agentB],
  );
});
after(async () => {
  await db?.close();
});

test("photo films resume shots after crashes and disputes, enforce paid leases, and deliver only complete films", async () => {
  const database = await createTestDatabase();
  try {
    await database.exec(
      await readFile(
        new URL("../supabase/sql-editor-setup.sql", import.meta.url),
        "utf8",
      ),
    );
    const installer = await readFile(
      new URL("../supabase/sql-editor-property-films.sql", import.meta.url),
      "utf8",
    );
    await database.exec(installer);
    await database.exec(installer);
    await database.query(
      "insert into auth.users(id,email) values($1,'filmmaker@example.com')",
      [agentA],
    );
    await database.exec(
      "update profiles set name='Agent Name',phone='+1 555 123 4567'",
    );
    await database.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,'film-home','A lovely home','A long and meaningful description of this lovely home.','Austin, TX',500000,1500,array['https://example.com/front.jpg','https://example.com/living.jpg'])",
      [propertyA, agentA],
    );
    await database.exec("select activate_property_billing()");
    const purchase = await database.query<{
      request_property_publication: { order: { id: string } };
    }>("select request_property_publication($1,$2)", [propertyA, agentA]);
    const order = purchase.rows[0].request_property_publication.order.id;
    const leaseA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      leaseB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const claim = async (lease: string) =>
      (
        await database.query<{
          claim_property_montage: {
            attempts: number;
            montage_next_shot: number;
          } | null;
        }>("select claim_property_montage($1,$2)", [order, lease])
      ).rows[0].claim_property_montage;
    const checkpoint = async (
      lease: string,
      plan: unknown = null,
      next: number | null = null,
      url: string | null = null,
      error: string | null = null,
    ) =>
      (
        await database.query<{ checkpoint_property_montage: boolean }>(
          "select checkpoint_property_montage($1,$2,1,$3,$4,$5,$6)",
          [order, lease, plan ? JSON.stringify(plan) : null, next, url, error],
        )
      ).rows[0].checkpoint_property_montage;
    const due = () =>
      database.exec(
        "update property_video_jobs set next_poll_at=now()-interval '1 second',lease_until=now()-interval '1 second'",
      );
    await database.exec("set role authenticated");
    await assert.rejects(claim(leaseA), /permission denied/i);
    await assert.rejects(checkpoint(leaseA), /permission denied/i);
    await database.exec("reset role; set role service_role");
    assert.equal(await claim(leaseA), null);
    await database.query(
      "select apply_property_payment($1,'pi_film','paid',100)",
      [order],
    );
    assert.equal((await claim(leaseA))?.attempts, 1);
    assert.equal(await claim(leaseB), null);
    const plan = {
      engine: "photo-montage-v1",
      shots: [
        { image: "https://example.com/front.jpg" },
        { image: "https://example.com/living.jpg" },
      ],
    };
    assert.equal(await checkpoint(leaseA, plan), true);
    await due();
    assert.equal((await claim(leaseB))?.attempts, 1);
    assert.equal(
      await checkpoint(leaseA, null, 1),
      false,
      "Stale lease cannot advance progress",
    );
    assert.equal(
      await checkpoint(leaseB, null, null, "https://example.com/premature.mp4"),
      false,
    );
    assert.equal(
      await checkpoint(leaseB, null, 2),
      false,
      "Cannot skip a shot",
    );
    assert.equal(await checkpoint(leaseB, null, 1), true);
    await due();
    assert.equal((await claim(leaseA))?.montage_next_shot, 1);
    // A renderer crash has no paid-provider ambiguity; resume the same shot.
    await due();
    assert.equal((await claim(leaseB))?.montage_next_shot, 1);
    assert.equal(await checkpoint(leaseA, null, 2), false);
    await database.query(
      "select apply_property_payment($1,'pi_film','disputed',200)",
      [order],
    );
    assert.equal(await checkpoint(leaseB, null, 2), false);
    await database.query(
      "select apply_property_payment($1,'pi_film','paid',300)",
      [order],
    );
    await database.query("select request_property_publication($1,$2)", [
      propertyA,
      agentA,
    ]);
    await due();
    const restored = await claim(leaseA);
    assert.equal(restored?.attempts, 1);
    assert.equal(restored?.montage_next_shot, 1);
    assert.equal(await checkpoint(leaseA, null, 2), true);
    await due();
    await claim(leaseB);
    assert.equal(
      await checkpoint(leaseB, null, null, "https://example.com/film.mp4"),
      true,
    );
    assert.equal(
      await checkpoint(leaseB, null, null, "https://example.com/film.mp4"),
      false,
    );
    const state = await database.query<{
      status: string;
      video_status: string;
    }>(
      "select v.status,o.video_status from property_video_jobs v join property_orders o on o.id=v.order_id",
    );
    assert.deepEqual(state.rows[0], {
      status: "completed",
      video_status: "delivered",
    });
    await database.exec("reset role");
    const bucket = await database.query<{ public: boolean }>(
      "select public from storage.buckets where id='property-video-work'",
    );
    assert.equal(bucket.rows[0].public, false);
  } finally {
    await database.close();
  }
});

test("signup creates a private profile and agents see only their own data", async () => {
  await asAgent(agentA);
  const profiles = await db.query<{ id: string }>(
    "select id from public.profiles",
  );
  assert.deepEqual(
    profiles.rows.map((x) => x.id),
    [agentA],
  );
  const properties = await db.query<{ id: string }>(
    "select id from public.properties",
  );
  assert.deepEqual(
    properties.rows.map((x) => x.id),
    [propertyA],
  );
  const update = await db.query(
    "update public.properties set title = 'Stolen listing' where id = $1 returning id",
    [propertyB],
  );
  assert.equal(update.rows.length, 0);
  await assert.rejects(
    db.query(
      "insert into public.properties(owner_id,slug) values ($1,'spoofed-owner')",
      [agentB],
    ),
    /row-level security/i,
  );
});
test("public access exposes published content, hides drafts and private profile fields", async () => {
  await asAnon();
  await assert.rejects(
    db.query("select * from public.profiles"),
    /permission denied/i,
  );
  await assert.rejects(
    db.query("select * from public.properties"),
    /permission denied/i,
  );
  const published = await db.query<{
    data: {
      property: Record<string, unknown>;
      profile: Record<string, unknown>;
    };
  }>("select public.get_public_property('published-home') as data");
  assert.equal(published.rows[0].data.property.title, "A beautiful home");
  assert.equal(published.rows[0].data.property.owner_id, undefined);
  assert.equal(published.rows[0].data.profile.id, undefined);
  const draft = await db.query<{ data: null }>(
    "select public.get_public_property('private-draft') as data",
  );
  assert.equal(draft.rows[0].data, null);
});
test("profile changes appear immediately on every public design", async () => {
  await asAgent(agentA);
  await db.query(
    "update public.profiles set name='Updated Agent' where id=$1",
    [agentA],
  );
  for (const template of ["editorial", "minimal", "panorama"]) {
    await asAgent(agentA);
    await db.query("update public.properties set template=$1 where id=$2", [
      template,
      propertyA,
    ]);
    await asAnon();
    const data = await db.query<{ name: string }>(
      "select public.get_public_property('published-home')->'profile'->>'name' as name",
    );
    assert.equal(data.rows[0].name, "Updated Agent");
  }
});
test("database validation prevents incomplete publication and changes to public URLs", async () => {
  await asAgent(agentB);
  await assert.rejects(
    db.query("update public.properties set status='published' where id=$1", [
      propertyB,
    ]),
    /published_details_complete/i,
  );
  await asAgent(agentA);
  await assert.rejects(
    db.query("update public.profiles set phone='' where id=$1", [agentA]),
    /complete contact details/i,
  );
  await assert.rejects(
    db.query("update public.properties set slug='renamed' where id=$1", [
      propertyA,
    ]),
    /cannot be changed/i,
  );
  await assert.rejects(
    db.query(
      "update public.properties set images=array['javascript:alert(1)'] where id=$1",
      [propertyA],
    ),
    /HTTPS storage/i,
  );
});
test("contact forms route to the correct owner, limit repeat sends, and hide messages from other accounts", async () => {
  await asAnon();
  const args = [
    "published-home",
    "Visitor Name",
    "visitor@example.com",
    "",
    "I would love to arrange a showing.",
  ];
  for (let i = 0; i < 3; i++) {
    const result = await db.query<{ result: string }>(
      "select public.submit_property_inquiry($1,$2,$3,$4,$5) as result",
      args,
    );
    assert.equal(result.rows[0].result, "received");
  }
  const limited = await db.query<{ result: string }>(
    "select public.submit_property_inquiry($1,$2,$3,$4,$5) as result",
    args,
  );
  assert.equal(limited.rows[0].result, "rate_limited");
  const draft = await db.query<{ result: string }>(
    "select public.submit_property_inquiry($1,$2,$3,$4,$5) as result",
    ["private-draft", ...args.slice(1)],
  );
  assert.equal(draft.rows[0].result, "unavailable");
  await assert.rejects(
    db.query("select * from public.inquiries"),
    /permission denied/i,
  );
  await asAgent(agentB);
  assert.equal(
    (await db.query("select * from public.inquiries")).rows.length,
    0,
  );
  await asAgent(agentA);
  assert.equal(
    (await db.query("select * from public.inquiries")).rows.length,
    3,
  );
});
test("a preferred viewing date reaches only the listing agent’s existing inbox", async () => {
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 2);
  const preferredDate = future.toISOString().slice(0, 10);
  const parsed = validateInquiry({
    slug: "published-home",
    name: "Viewing Guest",
    email: "viewing@example.com",
    phone: "+1 202 555 0100",
    message: "Please call to confirm.",
    preferredDate,
  });
  assert.ok(parsed.ok);
  const value = parsed.value;
  await asAnon();
  const result = await db.query<{ result: string }>(
    "select public.submit_property_inquiry($1,$2,$3,$4,$5) as result",
    [value.slug, value.name, value.email, value.phone, value.message],
  );
  assert.equal(result.rows[0].result, "received");
  await asAgent(agentB);
  assert.equal(
    (
      await db.query(
        "select * from public.inquiries where email = 'viewing@example.com'",
      )
    ).rows.length,
    0,
  );
  await asAgent(agentA);
  const saved = await db.query<{ message: string; property_id: string }>(
    "select message, property_id from public.inquiries where email = 'viewing@example.com'",
  );
  assert.equal(saved.rows[0].message, value.message);
  assert.ok(saved.rows[0].message.includes(preferredDate));
  assert.equal(saved.rows[0].property_id, propertyA);
});

test("property stories remain owner-controlled, are public only with the listing, and have a durable budget", async () => {
  await asAnon();
  await assert.rejects(
    db.query("select public.reserve_property_story($1)", [propertyA]),
    /permission denied/i,
  );
  await asAgent(agentB);
  assert.equal(
    (
      await db.query<{ result: string }>(
        "select public.reserve_property_story($1) as result",
        [propertyA],
      )
    ).rows[0].result,
    "unavailable",
  );
  await asAgent(agentA);
  await assert.rejects(
    db.query("select * from public.property_story_usage"),
    /permission denied/i,
  );
  await assert.rejects(
    db.query("delete from public.property_story_usage"),
    /permission denied/i,
  );
  const reserve = async () =>
    (
      await db.query<{ result: string }>(
        "select public.reserve_property_story($1) as result",
        [propertyA],
      )
    ).rows[0].result;
  assert.equal(await reserve(), "reserved");
  assert.equal(await reserve(), "cooldown");
  for (let i = 1; i < 5; i++) {
    await db.exec(
      "reset role; update public.property_story_usage set last_started_at = now() - interval '2 minutes';",
    );
    await asAgent(agentA);
    assert.equal(await reserve(), "reserved");
  }
  await db.exec(
    "reset role; update public.property_story_usage set last_started_at = now() - interval '2 minutes';",
  );
  await asAgent(agentA);
  assert.equal(await reserve(), "daily_limit");
  await db.exec(
    "reset role; update public.property_story_usage set usage_day = current_date - 1;",
  );
  await asAgent(agentA);
  assert.equal(await reserve(), "reserved");
  const copy = {
    version: 1,
    source: "example",
    content: { heroLine: "Property-specific copy" },
  };
  await db.query("update public.properties set website_copy = $1 where id=$2", [
    JSON.stringify(copy),
    propertyA,
  ]);
  await asAgent(agentB);
  assert.equal(
    (
      await db.query(
        "update public.properties set website_copy = null where id=$1 returning id",
        [propertyA],
      )
    ).rows.length,
    0,
  );
  await asAnon();
  const published = await db.query<{
    data: { property: { website_copy: unknown } };
  }>("select public.get_public_property('published-home') as data");
  assert.deepEqual(published.rows[0].data.property.website_copy, copy);
});

test("the stories update upgrades the original schema without replacing existing listings", async () => {
  const isolated = await createTestDatabase();
  try {
    await isolated.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610230001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await isolated.query(
      "insert into auth.users(id, email) values ($1, 'existing@example.com')",
      [agentA],
    );
    await isolated.query(
      "insert into public.properties(id, owner_id, slug, title) values ($1, $2, 'existing-home', 'Existing property')",
      [propertyA, agentA],
    );
    const before = (await isolated.query("select * from public.properties"))
      .rows[0];
    await isolated.exec(
      await readFile(
        new URL("../supabase/sql-editor-property-stories.sql", import.meta.url),
        "utf8",
      ),
    );
    const { website_copy, ...unchanged } = (
      await isolated.query<Record<string, unknown>>(
        "select * from public.properties",
      )
    ).rows[0];
    assert.equal(website_copy, null);
    assert.deepEqual(unchanged, before);
  } finally {
    await isolated.close();
  }
});

test("the additive stories installer can be reapplied without changing listings", async () => {
  await db.exec("reset role;");
  const before = await db.query("select * from public.properties order by id");
  const update = await readFile(
    new URL("../supabase/sql-editor-property-stories.sql", import.meta.url),
    "utf8",
  );
  await db.exec(update);
  await db.exec(update);
  assert.deepEqual(
    (await db.query("select * from public.properties order by id")).rows,
    before.rows,
  );
});

test("unpublishing removes public access immediately", async () => {
  await asAgent(agentA);
  await db.query("update public.properties set status='draft' where id=$1", [
    propertyA,
  ]);
  await asAnon();
  const data = await db.query<{ data: null }>(
    "select public.get_public_property('published-home') as data",
  );
  assert.equal(data.rows[0].data, null);
});
test("storage policies prevent uploads and deletes in another agent’s directory", async () => {
  await asAgent(agentA);
  await db.query(
    "insert into storage.objects(bucket_id,name) values ('property-images',$1)",
    [`${agentA}/${propertyA}/photo.webp`],
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values ('property-images',$1)",
      [`${agentB}/stolen.webp`],
    ),
    /row-level security/i,
  );
  await asAgent(agentB);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("delete from storage.objects returning id")).rows.length,
    0,
  );
});

test("rerunning the SQL Editor installer preserves existing agent data", async () => {
  await db.exec("reset role;");
  const before = await db.query("select * from public.properties order by id");
  const installer = await readFile(
    new URL("../supabase/sql-editor-setup.sql", import.meta.url),
    "utf8",
  );
  await assert.rejects(db.exec(installer), /already exists/i);
  await db.exec("rollback;");
  const after = await db.query("select * from public.properties order by id");
  assert.deepEqual(after.rows, before.rows);
});

test("a late storage conflict rolls back the entire SQL Editor installation", async () => {
  const isolated = await createTestDatabase();
  try {
    await isolated.exec(`
      insert into storage.buckets(id, name, public)
      values ('property-images', 'Existing private bucket', false);
    `);
    const installer = await readFile(
      new URL("../supabase/sql-editor-setup.sql", import.meta.url),
      "utf8",
    );
    await assert.rejects(isolated.exec(installer), /duplicate key/i);
    await isolated.exec("rollback;");
    const tables = await isolated.query(`select
      to_regclass('public.profiles') as profiles,
      to_regclass('public.properties') as properties,
      to_regclass('public.inquiries') as inquiries`);
    assert.deepEqual(tables.rows, [
      { profiles: null, properties: null, inquiries: null },
    ]);
    const bucket = await isolated.query(
      "select name, public from storage.buckets",
    );
    assert.deepEqual(bucket.rows, [
      { name: "Existing private bucket", public: false },
    ]);
  } finally {
    await isolated.close();
  }
});

test("account tools upgrade safely, isolate portraits and deletes, and preserve leads after property deletion", async () => {
  const database = await createTestDatabase();
  const role = (id: string) =>
    database.exec(
      `reset role; set role authenticated; set app.user_id = '${id}';`,
    );
  try {
    await database.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610230001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await database.exec(
      `insert into auth.users(id,email,raw_user_meta_data) values ('${agentA}','a@example.com','{"name":"Agent A"}'),('${agentB}','b@example.com','{"name":"Agent B"}'); update public.profiles set phone = '+1 202 555 0148';`,
    );
    await role(agentA);
    await database.query(
      "insert into public.properties(id,owner_id,slug,title,description,location,price,area,images,status) values ($1,$2,'portrait-home','Portrait home','A complete description for this lovely property.','Austin, TX',500000,2000,array['https://example.com/home.jpg'],'published')",
      [propertyA, agentA],
    );
    await database.exec("reset role;");
    await database.query(
      "insert into public.inquiries(property_id,owner_id,name,email,message) values ($1,$2,'Buyer','buyer@example.com','Please arrange a private tour.')",
      [propertyA, agentA],
    );
    const upgrade = await readFile(
      new URL("../supabase/sql-editor-account-tools.sql", import.meta.url),
      "utf8",
    );
    await database.exec(upgrade);
    await database.exec(upgrade);
    await role(agentA);
    const avatar = `https://project.supabase.co/storage/v1/object/public/agent-avatars/${agentA}/photo.webp`;
    await database.query(
      "update public.profiles set avatar_url = $1 where id = $2",
      [avatar, agentA],
    );
    await database.query(
      "insert into storage.objects(bucket_id,name) values ('agent-avatars',$1)",
      [`${agentA}/photo.webp`],
    );
    await assert.rejects(
      database.query(
        "insert into storage.objects(bucket_id,name) values ('agent-avatars',$1)",
        [`${agentB}/photo.webp`],
      ),
    );
    await role(agentB);
    const forbidden = await database.query<{ deleted: boolean }>(
      "select public.delete_owned_property($1) as deleted",
      [propertyA],
    );
    assert.equal(forbidden.rows[0].deleted, false);
    assert.equal(
      (
        await database.query(
          "delete from public.inquiries where owner_id = $1 returning id",
          [agentA],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await database.query(
          "update public.profiles set avatar_url = '' where id = $1 returning id",
          [agentA],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await database.query(
          "delete from storage.objects where bucket_id = 'agent-avatars' returning id",
        )
      ).rows.length,
      0,
    );
    await database.exec("reset role; set role anon; set app.user_id = ''; ");
    const publicPage = await database.query<{
      page: { profile: { avatar_url: string } };
    }>("select public.get_public_property('portrait-home') as page");
    assert.equal(publicPage.rows[0].page.profile.avatar_url, avatar);
    await assert.rejects(
      database.query("select public.delete_owned_property($1)", [propertyA]),
    );
    await role(agentA);
    assert.equal(
      (
        await database.query<{ deleted: boolean }>(
          "select public.delete_owned_property($1) as deleted",
          [propertyA],
        )
      ).rows[0].deleted,
      true,
    );
    const leads = await database.query<{ property_id: string | null }>(
      "select property_id from public.inquiries",
    );
    assert.equal(leads.rows.length, 1);
    assert.equal(leads.rows[0].property_id, null);
    assert.equal(
      (await database.query("delete from public.inquiries returning id")).rows
        .length,
      1,
    );
    await database.exec("reset role; set role anon; set app.user_id = ''; ");
    assert.equal(
      (
        await database.query<{ page: null }>(
          "select public.get_public_property('portrait-home') as page",
        )
      ).rows[0].page,
      null,
    );
  } finally {
    await database.close();
  }
});

test("paid publication intent publishes once, preserves payment on invalid drafts, and queues one private video job", async () => {
  const database = await createTestDatabase();
  try {
    await database.exec(
      await readFile(
        new URL("../supabase/sql-editor-setup.sql", import.meta.url),
        "utf8",
      ),
    );
    const upgrade = await readFile(
      new URL("../supabase/sql-editor-publish-workflow.sql", import.meta.url),
      "utf8",
    );
    await database.exec(upgrade);
    await database.exec(upgrade);
    await database.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'agent@example.com','{\"name\":\"Agent Owner\"}')",
      [agentA],
    );
    await database.exec("update profiles set phone='+1 202 555 0123'");
    await database.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,'payment-property','A beautiful property','A generous home with light-filled living spaces.','Austin, TX',900000,2000,array['https://example.com/cover.jpg'])",
      [propertyA, agentA],
    );
    await database.exec("set role authenticated");
    await assert.rejects(
      database.query("select request_property_publication($1,$2)", [
        propertyA,
        agentA,
      ]),
      /permission denied/,
    );
    await assert.rejects(
      database.query("select * from property_video_jobs"),
      /permission denied/,
    );
    await database.exec("reset role; set role service_role");
    await database.query("select activate_property_billing()");
    await assert.rejects(
      database.query("select request_property_publication($1,$2)", [
        propertyA,
        agentB,
      ]),
      /Property not available/,
    );
    const request = await database.query<{
      request_property_publication: { order: { id: string } };
    }>("select request_property_publication($1,$2)", [propertyA, agentA]);
    const order = request.rows[0].request_property_publication.order.id;
    assert.equal(
      (await database.query("select * from property_video_jobs")).rows.length,
      0,
    );
    await database.query("select apply_property_payment($1,$2,$3,$4)", [
      order,
      "pi_publish",
      "paid",
      100,
    ]);
    await database.exec("reset role");
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from properties where id=$1",
          [propertyA],
        )
      ).rows[0].status,
      "published",
    );
    const job = await database.query<{
      status: string;
      source: { images: string[] };
    }>("select * from property_video_jobs");
    assert.equal(job.rows.length, 1);
    assert.equal(job.rows[0].status, "queued");
    assert.equal(job.rows[0].source.images[0], "https://example.com/cover.jpg");
    await database.exec("update property_video_jobs set status='failed'");
    assert.equal(
      (
        await database.query<{ retry_property_video: boolean }>(
          "select retry_property_video($1,$2)",
          [propertyA, agentB],
        )
      ).rows[0].retry_property_video,
      false,
    );
    assert.equal(
      (
        await database.query<{ retry_property_video: boolean }>(
          "select retry_property_video($1,$2)",
          [propertyA, agentA],
        )
      ).rows[0].retry_property_video,
      true,
    );
    assert.equal(
      (
        await database.query<{ retry_property_video: boolean }>(
          "select retry_property_video($1,$2)",
          [propertyA, agentA],
        )
      ).rows[0].retry_property_video,
      false,
    );
    await database.query("update properties set status='draft' where id=$1", [
      propertyA,
    ]);
    await database.query("select apply_property_payment($1,$2,$3,$4)", [
      order,
      "pi_publish",
      "paid",
      100,
    ]);
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from properties where id=$1",
          [propertyA],
        )
      ).rows[0].status,
      "draft",
    );
    await database.query("select request_property_publication($1,$2)", [
      propertyA,
      agentA,
    ]);
    assert.equal(
      (await database.query("select * from property_video_jobs")).rows.length,
      1,
    );
    await database.exec(
      "update property_video_jobs set status='completed',video_url='https://example.com/film.mp4'",
    );
    await database.exec("set role anon");
    const pub = await database.query<{
      get_public_property: { film: { src: string } };
    }>("select get_public_property('payment-property')");
    assert.equal(
      pub.rows[0].get_public_property.film.src,
      "https://example.com/film.mp4",
    );
    await database.exec("reset role");
    await database.query("select apply_property_payment($1,$2,$3,$4)", [
      order,
      "pi_publish",
      "refunded",
      200,
    ]);
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from property_video_jobs",
        )
      ).rows[0].status,
      "cancelled",
    );
    assert.equal(
      (
        await database.query<{ retry_property_video: boolean }>(
          "select retry_property_video($1,$2)",
          [propertyA, agentA],
        )
      ).rows[0].retry_property_video,
      false,
    );
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from properties where id=$1",
          [propertyA],
        )
      ).rows[0].status,
      "draft",
    );

    // If the saved facts become invalid while Checkout is open, retain the paid
    // receipt and let the owner fix the draft without paying again.
    await database.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,'review-property','Another beautiful home','A long, inviting description of this lovely property.','Austin, TX',500000,1500,array['https://example.com/home.jpg'])",
      [propertyB, agentA],
    );
    const next = await database.query<{
      request_property_publication: { order: { id: string } };
    }>("select request_property_publication($1,$2)", [propertyB, agentA]);
    const second = next.rows[0].request_property_publication.order.id;
    await database.query("update properties set description='' where id=$1", [
      propertyB,
    ]);
    await database.query("select apply_property_payment($1,$2,$3,$4)", [
      second,
      "pi_review",
      "paid",
      300,
    ]);
    const paid = await database.query<{
      status: string;
      publication_error: string;
    }>("select status,publication_error from property_orders where id=$1", [
      second,
    ]);
    assert.equal(paid.rows[0].status, "paid");
    assert.match(paid.rows[0].publication_error, /Review your property/);
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from properties where id=$1",
          [propertyB],
        )
      ).rows[0].status,
      "draft",
    );
    await database.query(
      "update properties set description='A long, inviting description of this lovely property.' where id=$1",
      [propertyB],
    );
    await database.query("select request_property_publication($1,$2)", [
      propertyB,
      agentA,
    ]);
    assert.equal(
      (
        await database.query<{ status: string }>(
          "select status from properties where id=$1",
          [propertyB],
        )
      ).rows[0].status,
      "published",
    );
  } finally {
    await database.close();
  }
});

test("Higgsfield jobs lease one submission, recover callbacks without a second charge, pin the model, and reject refunded delivery", async () => {
  const database = await createTestDatabase();
  try {
    await database.exec(
      await readFile(
        new URL("../supabase/sql-editor-setup.sql", import.meta.url),
        "utf8",
      ),
    );
    await database.exec(
      await readFile(
        new URL("../supabase/sql-editor-higgsfield.sql", import.meta.url),
        "utf8",
      ),
    );
    await database.query(
      "insert into auth.users(id,email) values($1,'agent@example.com')",
      [agentA],
    );
    await database.exec(
      "update profiles set name='Agent Name',phone='+1 555 123 4567'",
    );
    await database.query(
      "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$3,'video-home-one','A lovely home','A long, meaningful description of this lovely property.','Austin, TX',500000,1500,array['https://example.com/home.jpg']),($2,$3,'video-home-two','Another home','Another long, meaningful description of this lovely property.','Austin, TX',600000,1800,array['https://example.com/home2.jpg'])",
      [propertyA, propertyB, agentA],
    );
    await database.exec("select activate_property_billing()");
    const reserve = async (id: string) =>
      (
        await database.query<{
          request_property_publication: { order: { id: string } };
        }>("select request_property_publication($1,$2)", [id, agentA])
      ).rows[0].request_property_publication.order.id;
    const order = await reserve(propertyA),
      second = await reserve(propertyB);
    const model = {
      endpoint: "vendor/model-a",
      input: {},
      output: { kind: "video", path: "video.url" },
    };
    const leaseA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      leaseB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const claim = async (id: string, lease: string, config = model) =>
      (
        await database.query<{
          claim_property_video: {
            attempts: number;
            provider_request_id: string;
            model_config: typeof model;
          } | null;
        }>("select claim_property_video($1,$2,$3,$4)", [
          id,
          lease,
          JSON.stringify(config),
          JSON.stringify({ image: "saved-image" }),
        ])
      ).rows[0].claim_property_video;
    await database.exec("set role authenticated");
    await assert.rejects(claim(order, leaseA), /permission denied/i);
    await database.exec("reset role; set role service_role");
    assert.equal(await claim(order, leaseA), null, "Unpaid jobs cannot start");
    await database.query(
      "select apply_property_payment($1,'pi_video_one','paid',100)",
      [order],
    );
    assert.equal((await claim(order, leaseA))?.attempts, 1);
    assert.equal(
      await claim(order, leaseB),
      null,
      "Concurrent workers cannot submit the same job",
    );
    await database.query(
      "update property_video_jobs set lease_until=now()-interval '1 second' where order_id=$1",
      [order],
    );
    assert.equal(
      await claim(order, leaseB),
      null,
      "Expired submissions without an ID are not retried",
    );
    assert.equal(
      (
        await database.query<{ provider_phase: string }>(
          "select provider_phase from property_video_jobs where order_id=$1",
          [order],
        )
      ).rows[0].provider_phase,
      "uncertain",
    );
    const bind = async (attempt: number, requestId: string) =>
      (
        await database.query<{ bind_property_video_request: boolean }>(
          "select bind_property_video_request($1,$2,$3)",
          [order, attempt, requestId],
        )
      ).rows[0].bind_property_video_request;
    assert.equal(await bind(2, "request-wrong-attempt"), false);
    assert.equal(
      await bind(1, "request-original"),
      true,
      "A verified late callback recovers the request",
    );
    assert.equal(await bind(1, "request-other"), false);
    const resumed = await claim(order, leaseB, {
      ...model,
      endpoint: "vendor/model-b",
    });
    assert.equal(resumed?.provider_request_id, "request-original");
    assert.equal(
      resumed?.model_config.endpoint,
      "vendor/model-a",
      "Changing models never changes a running job",
    );
    const finish = async (id: string, lease: string) =>
      (
        await database.query<{ advance_property_video: boolean }>(
          "select advance_property_video($1,$2,1,'completed','https://storage.example/video.mp4',null)",
          [id, lease],
        )
      ).rows[0].advance_property_video;
    assert.equal(
      await finish(order, leaseA),
      false,
      "A stale lease cannot deliver",
    );
    assert.equal(await finish(order, leaseB), true);
    assert.equal(
      await finish(order, leaseB),
      false,
      "Duplicate completion does not mutate finished jobs",
    );
    assert.equal(
      (
        await database.query<{ video_status: string }>(
          "select video_status from property_orders where id=$1",
          [order],
        )
      ).rows[0].video_status,
      "delivered",
    );
    await database.query(
      "select apply_property_payment($1,'pi_video_two','paid',100)",
      [second],
    );
    assert.equal((await claim(second, leaseA))?.attempts, 1);
    await database.query(
      "select bind_property_video_request($1,1,'request-second')",
      [second],
    );
    await database.query(
      "select advance_property_video($1,$2,1,'failed',null,'Provider failed')",
      [second, leaseA],
    );
    const retry = async () =>
      (
        await database.query<{ retry_property_video: boolean }>(
          "select retry_property_video($1,$2)",
          [propertyB, agentA],
        )
      ).rows[0].retry_property_video;
    assert.equal(await retry(), false, "Retries have a cooldown");
    await database.query(
      "update property_video_jobs set updated_at=now()-interval '2 minutes' where order_id=$1",
      [second],
    );
    assert.equal(await retry(), true);
    assert.equal((await claim(second, leaseB))?.attempts, 2);
    await database.query(
      "select bind_property_video_request($1,2,'request-second-attempt')",
      [second],
    );
    await database.query(
      "select apply_property_payment($1,'pi_video_two','disputed',150)",
      [second],
    );
    await database.query(
      "select apply_property_payment($1,'pi_video_two','paid',160)",
      [second],
    );
    await database.query("select request_property_publication($1,$2)", [
      propertyB,
      agentA,
    ]);
    const restored = await claim(second, leaseA);
    assert.equal(
      restored?.attempts,
      2,
      "A won dispute does not create another generation",
    );
    assert.equal(restored?.provider_request_id, "request-second-attempt");
    await database.query(
      "select apply_property_payment($1,'pi_video_two','refunded',200)",
      [second],
    );
    assert.equal(
      (
        await database.query<{ bind_property_video_request: boolean }>(
          "select bind_property_video_request($1,2,'request-new')",
          [second],
        )
      ).rows[0].bind_property_video_request,
      false,
    );
    assert.equal(
      await finish(second, leaseB),
      false,
      "A refunded job cannot publish media",
    );
    assert.equal(await retry(), false);
    await database.exec("reset role; set role anon");
    await assert.rejects(
      database.exec("select * from property_video_jobs"),
      /permission denied/i,
    );
    const publicData = await database.query<{
      get_public_property: { film: { src: string } };
    }>("select get_public_property('video-home-one')");
    assert.equal(
      publicData.rows[0].get_public_property.film.src,
      "https://storage.example/video.mp4",
    );
  } finally {
    await database.close();
  }
});
