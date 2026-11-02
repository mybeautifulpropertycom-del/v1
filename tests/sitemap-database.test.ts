import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("public discovery is paginated, read-only, and excludes drafts and unpublished properties", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      grant usage on schema public to anon, authenticated;
      create table profiles(id uuid primary key, email text);
      create table properties(id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id), slug text, address_slug text, status text, updated_at timestamptz default now(), description text);
      alter table profiles enable row level security;
      alter table properties enable row level security;
      insert into profiles values ('11111111-1111-4111-8111-111111111111','private@example.com');
      insert into properties(owner_id,slug,address_slug,status,description)
        select '11111111-1111-4111-8111-111111111111', 'home-'||n, 'address-'||n, 'published', 'description' from generate_series(1,1001) n;
      insert into properties(owner_id,slug,status,description) values ('11111111-1111-4111-8111-111111111111','private-draft','draft','private details');
    `);
    const migration = await readFile(
      new URL(
        "../supabase/migrations/202611020001_public_sitemap.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("set role anon");
    const read = async (page: number) =>
      (
        await db.query<{
          result: { total: number; items: Array<{ slug: string }> };
        }>("select get_public_sitemap($1) result", [page])
      ).rows[0].result;
    const first = await read(0);
    const second = await read(1);
    assert.equal(first.total, 1001);
    assert.equal(first.items.length, 1000);
    assert.equal(second.items.length, 1);
    assert.equal(
      new Set([...first.items, ...second.items].map((p) => p.slug)).size,
      1001,
    );
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
      "address_slug",
      "slug",
      "updated_at",
    ]);
    assert.ok(!JSON.stringify(first).includes("private"));
    await assert.rejects(
      db.query("select * from properties"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select * from profiles"),
      /permission denied/i,
    );
    await assert.rejects(read(-1), /Invalid sitemap page/);
    await db.exec(
      "reset role; update properties set status='draft' where slug='home-1'; set role anon",
    );
    assert.equal((await read(0)).total, 1000);
    assert.deepEqual((await read(1)).items, []);
  } finally {
    await db.close();
  }
});
