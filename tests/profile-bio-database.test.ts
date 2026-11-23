import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("profile bio quota is private, counts successful generations only and fences stale requests", async () => {
  const db = new PGlite();
  try {
    const owner = crypto.randomUUID(),
      other = crypto.randomUUID();
    const first = crypto.randomUUID(),
      replacement = crypto.randomUUID();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles (id uuid primary key);
    `);
    await db.query("insert into public.profiles values ($1), ($2)", [
      owner,
      other,
    ]);
    const migration = await readFile(
      new URL("../supabase/sql-editor-profile-bio.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const reserve = async (agent: string, id: string) =>
      (
        await db.query(
          "select public.reserve_profile_bio($1, $2) as remaining",
          [agent, id],
        )
      ).rows[0];
    const finish = async (agent: string, id: string, success: boolean) =>
      (
        await db.query(
          "select public.finish_profile_bio($1, $2, $3) as remaining",
          [agent, id, success],
        )
      ).rows[0];

    await db.exec("set role authenticated");
    await assert.rejects(reserve(owner, first), /permission denied/);
    await assert.rejects(finish(owner, first, false), /permission denied/);
    await assert.rejects(
      db.query("select * from public.profile_bio_usage"),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    assert.deepEqual(await reserve(owner, first), { remaining: 3 });
    assert.deepEqual(await reserve(owner, replacement), { remaining: -1 });
    assert.deepEqual(await reserve(other, first), { remaining: 3 });
    assert.deepEqual(await finish(owner, first, false), { remaining: 3 });

    await db.exec("reset role");
    await db.query(
      "update public.profile_bio_usage set reserved_until = now() - interval '1 second' where owner_id=$1",
      [owner],
    );
    await db.exec("set role service_role");
    assert.deepEqual(await reserve(owner, replacement), { remaining: 3 });
    assert.deepEqual(await finish(owner, first, true), { remaining: null });
    assert.deepEqual(await finish(owner, replacement, true), { remaining: 2 });
    assert.deepEqual(await finish(owner, replacement, true), {
      remaining: null,
    });
    for (const expected of [2, 1]) {
      const id = crypto.randomUUID();
      assert.deepEqual(await reserve(owner, id), { remaining: expected });
      assert.deepEqual(await finish(owner, id, true), {
        remaining: expected - 1,
      });
    }

    await db.exec("reset role");
    await db.exec(migration);
    await db.exec("set role service_role");
    assert.deepEqual(await reserve(owner, crypto.randomUUID()), {
      remaining: 0,
    });
    assert.deepEqual(await finish(other, first, true), { remaining: 2 });
  } finally {
    await db.close();
  }
});
