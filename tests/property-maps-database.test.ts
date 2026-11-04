import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("map migration is repeatable, preserves listings and clears stale pins for all update paths", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.properties(id integer primary key, location text, status text);
      insert into public.properties values (1,'123 Home St','published'),(2,'Draft address','draft');
      alter table public.properties enable row level security;`);
    const sql = await readFile(
      new URL(
        "../supabase/migrations/202611040001_property_maps.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const rows = () =>
      db.query<{
        id: number;
        location: string;
        status: string;
        google_place_id: string | null;
      }>("select * from properties order by id");
    assert.deepEqual((await rows()).rows, [
      {
        id: 1,
        location: "123 Home St",
        status: "published",
        google_place_id: null,
      },
      {
        id: 2,
        location: "Draft address",
        status: "draft",
        google_place_id: null,
      },
    ]);
    await db.exec(
      "update properties set google_place_id='ChIJ-home' where id=1",
    );
    await db.exec("update properties set status='draft' where id=1");
    assert.equal((await rows()).rows[0].google_place_id, "ChIJ-home");
    await db.exec("update properties set location='456 Other St' where id=1");
    assert.equal((await rows()).rows[0].google_place_id, null);
    await db.exec(
      "update properties set location='789 Selected St',google_place_id='ChIJ-new' where id=1",
    );
    assert.equal((await rows()).rows[0].google_place_id, "ChIJ-new");
    await assert.rejects(
      db.exec("update properties set google_place_id='<script>' where id=1"),
      /properties_google_place_id_valid/,
    );
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid='properties'::regclass",
    );
    assert.equal(rls.rows[0].relrowsecurity, true);
  } finally {
    await db.close();
  }
});
