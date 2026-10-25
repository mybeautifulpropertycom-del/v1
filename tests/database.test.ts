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
