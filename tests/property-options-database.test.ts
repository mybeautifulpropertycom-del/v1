import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("the Studio upgrade is repeatable and preserves every existing property and legacy type", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.properties (
      id integer primary key,
      type text not null constraint properties_type_check check (type in ('House','Town House','Condo','Penthouse','Land')),
      amenities text[] not null default '{}', status text not null default 'published'
    );
    insert into properties(id,type,amenities) values
      (1,'House',array['Grădină privată']), (2,'Town House',array['Garaj pentru două mașini']),
      (3,'Condo','{}'), (4,'Penthouse','{}'), (5,'Land','{}');`);
    const before = (await db.query("select * from properties order by id"))
      .rows;
    await assert.rejects(
      db.exec("insert into properties(id,type) values(6,'Studio')"),
      /properties_type_check/,
    );
    const sql = await readFile(
      new URL("../supabase/sql-editor-property-options.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    assert.deepEqual(
      (await db.query("select * from properties order by id")).rows,
      before,
    );
    await db.exec(
      "insert into properties(id,type,amenities) values(6,'Studio',array['WiFi','Supraveghere video','Alarmă','Balcon','Loc de parcare'])",
    );
    await db.exec(sql);
    assert.equal(
      (
        await db.query<{ type: string }>(
          "select type from properties where id=6",
        )
      ).rows[0].type,
      "Studio",
    );
    await assert.rejects(
      db.exec("insert into properties(id,type) values(7,'Unknown')"),
      /properties_type_check/,
    );
  } finally {
    await db.close();
  }
});
