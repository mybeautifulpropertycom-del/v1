import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("guide activation excludes existing profiles, enrols new ones once and isolates durable closing by owner", async () => {
  const db = new PGlite();
  const old = "11111111-1111-4111-8111-111111111111";
  const a = "22222222-2222-4222-8222-222222222222";
  const b = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      create table public.profiles(id uuid primary key);
      insert into public.profiles values('${old}');
    `);
    const installer = await readFile(
      new URL("../supabase/sql-editor-agent-onboarding.sql", import.meta.url),
      "utf8",
    );
    // Upgrade a database that already ran the original onboarding migration.
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202611170002_agent_onboarding.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query("select * from agent_onboarding")).rows.length,
      0,
    );
    await db.exec(`insert into profiles values('${a}'),('${b}');`);
    await db.exec(installer);
    assert.equal(
      (await db.query("select * from agent_onboarding")).rows.length,
      2,
    );
    await db.exec(`set role authenticated; set app.user_id='${a}';`);
    assert.deepEqual(
      (await db.query("select creation_seen from agent_onboarding")).rows,
      [{ creation_seen: false }],
    );
    assert.equal(
      (
        await db.query(
          "update agent_onboarding set creation_seen=true where owner_id=$1 returning creation_seen",
          [b],
        )
      ).rows.length,
      0,
    );
    await db.exec(
      "update agent_onboarding set creation_seen=true; update agent_onboarding set creation_seen=false;",
    );
    assert.deepEqual(
      (await db.query("select creation_seen from agent_onboarding")).rows,
      [{ creation_seen: true }],
    );
    assert.deepEqual(
      (await db.query("select owner_id,status from agent_onboarding")).rows,
      [{ owner_id: a, status: "active" }],
    );
    assert.equal(
      (
        await db.query(
          "update agent_onboarding set status='dismissed' where owner_id=$1 returning status",
          [b],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into agent_onboarding(owner_id) values($1)", [old]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update agent_onboarding set owner_id=$1", [b]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from agent_onboarding"),
      /permission denied/,
    );
    await db.query("update agent_onboarding set status='dismissed'");
    await db.query("update agent_onboarding set status='active'");
    assert.deepEqual(
      (await db.query("select status from agent_onboarding")).rows,
      [{ status: "dismissed" }],
    );
    await db.exec(
      `set app.user_id='${b}'; update agent_onboarding set status='completed';`,
    );
    await db.exec("reset role;");
    await db.exec(installer);
    assert.deepEqual(
      (
        await db.query(
          "select creation_seen from agent_onboarding order by owner_id",
        )
      ).rows,
      [{ creation_seen: true }, { creation_seen: false }],
    );
    assert.deepEqual(
      (await db.query("select status from agent_onboarding order by owner_id"))
        .rows,
      [{ status: "dismissed" }, { status: "completed" }],
    );
    await db.exec("set role anon;");
    await assert.rejects(
      db.query("select * from agent_onboarding"),
      /permission denied/,
    );
    await db.exec(`reset role; delete from profiles where id='${a}';`);
    assert.equal(
      (await db.query("select * from agent_onboarding where owner_id=$1", [a]))
        .rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
