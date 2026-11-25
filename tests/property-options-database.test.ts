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

test("the construction year upgrade accepts an optional year and preserves existing listings on rerun", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.properties (id integer primary key, title text);
      insert into public.properties values (1, 'Casă');
    `);
    const sql = await readFile(
      new URL(
        "../supabase/sql-editor-property-construction-year.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(sql);
    const listing = async () =>
      (await db.query("select * from public.properties")).rows[0];
    assert.deepEqual(await listing(), {
      id: 1,
      title: "Casă",
      construction_year: null,
    });
    await db.exec("update public.properties set construction_year=1987");
    await db.exec(sql);
    assert.deepEqual(await listing(), {
      id: 1,
      title: "Casă",
      construction_year: 1987,
    });
    await assert.rejects(
      db.exec("update public.properties set construction_year=999"),
      /properties_construction_year_check/,
    );
    await db.exec("update public.properties set construction_year=null");
    assert.deepEqual(await listing(), {
      id: 1,
      title: "Casă",
      construction_year: null,
    });
  } finally {
    await db.close();
  }
});

test("land area and floor details are optional, type-specific and preserved on rerun", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.properties (type text not null, area numeric not null);
      insert into public.properties values ('Town House', 140), ('Condo', 60);
    `);
    const sql = await readFile(
      new URL(
        "../supabase/sql-editor-property-land-area-and-floor.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const listings = async () =>
      (await db.query("select * from public.properties order by type")).rows;

    await db.exec(sql);
    assert.deepEqual(await listings(), [
      {
        type: "Condo",
        area: "60",
        land_area: null,
        floor: null,
        total_floors: null,
      },
      {
        type: "Town House",
        area: "140",
        land_area: null,
        floor: null,
        total_floors: null,
      },
    ]);
    await db.exec(`
      update public.properties set land_area = 450.5 where type = 'Town House';
      update public.properties set floor = 3, total_floors = 10 where type = 'Condo';
    `);
    const saved = await listings();
    await db.exec(sql);
    assert.deepEqual(await listings(), saved);
    for (const update of [
      "set land_area = 0 where type = 'Town House'",
      "set land_area = 450 where type = 'Condo'",
    ])
      await assert.rejects(
        db.exec(`update public.properties ${update}`),
        /properties_land_area_check/,
      );
    for (const update of [
      "set floor = 11 where type = 'Condo'",
      "set total_floors = null where type = 'Condo'",
      "set floor = 0, total_floors = 1 where type = 'Town House'",
    ])
      await assert.rejects(
        db.exec(`update public.properties ${update}`),
        /properties_floor_check/,
      );
    await db.exec(
      "update public.properties set floor = 0, total_floors = 0 where type = 'Condo'",
    );
  } finally {
    await db.close();
  }
});
