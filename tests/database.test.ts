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
    create role anon; create role authenticated;
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
