import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("unavailable links preserve the last public offer without exposing unpublished listings", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table properties(id int primary key, status text, transaction text, address_slug text);
      create table property_url_slugs(slug text primary key, property_id int references properties(id) on delete cascade);
      insert into properties values
        (1, 'published', 'sale', 'current-sale'),
        (2, 'published', 'rent', 'current-rent'),
        (3, 'draft', 'sale', null),
        (4, 'draft', 'rent', 'already-withdrawn');
      insert into property_url_slugs values
        ('current-sale', 1), ('old-sale', 1), ('current-rent', 2),
        ('private-draft', 3), ('already-withdrawn', 4);
    `);
    const migration = await readFile(
      new URL(
        "../supabase/migrations/202611250001_unavailable_property_links.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const read = async (slug: string) =>
      (
        await db.query<{ offer: string | null }>(
          "select get_unavailable_property_offer($1) offer",
          [slug],
        )
      ).rows[0].offer;

    await db.exec("set role anon");
    assert.equal(await read("private-draft"), null);
    assert.equal(await read("current-sale"), null);
    assert.equal(await read("unknown"), null);
    assert.equal(await read("already-withdrawn"), "rent");
    await assert.rejects(
      db.query("select * from unavailable_property_links"),
      /permission denied/i,
    );

    await db.exec(`
      reset role;
      update properties set status = 'draft', transaction = 'rent' where id = 1;
      delete from properties where id = 2;
      set role anon;
    `);
    assert.equal(await read("current-sale"), "sale");
    assert.equal(await read("old-sale"), "sale");
    assert.equal(await read("current-rent"), "rent");
    await db.exec(
      "reset role; update properties set status = 'published' where id = 1; set role anon",
    );
    assert.equal(await read("old-sale"), null);

    await db.exec(`
      reset role;
      insert into properties values (5, 'draft', 'sale', null);
      insert into property_url_slugs values ('current-rent', 5);
      set role anon;
    `);
    assert.equal(await read("current-rent"), null);
  } finally {
    await db.close();
  }
});
