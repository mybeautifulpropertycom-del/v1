import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrate-platform-domain.sql", "utf8");
const schema = `
create schema vault;
create table vault.secrets(id uuid primary key, name text unique, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.update_secret(uuid,text) returns void language sql as
  'update vault.secrets set secret=$2 where id=$1';
insert into vault.secrets values
 ('11111111-1111-4111-8111-111111111111','mbp_higgsfield_worker','test-worker-secret'),
 ('22222222-2222-4222-8222-222222222222','another_site','https://unrelated.example');
`;

test("domain migration updates the existing site secret once without replacing worker credentials or unrelated data", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(
      "insert into vault.secrets values ('33333333-3333-4333-8333-333333333333','mbp_higgsfield_site','https://pucioasa-premium-beige.vercel.app')",
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.exec(migration);
      const { rows } = await db.query<{
        id: string;
        name: string;
        secret: string;
      }>("select * from vault.secrets order by name");
      assert.equal(rows.length, 3);
      assert.equal(
        rows.find((row) => row.name === "mbp_higgsfield_site")!.secret,
        "https://urmatoarea-proprietate.ro",
      );
      assert.equal(
        rows.find((row) => row.name === "mbp_higgsfield_site")!.id,
        "33333333-3333-4333-8333-333333333333",
      );
      assert.equal(
        rows.find((row) => row.name === "mbp_higgsfield_worker")!.secret,
        "test-worker-secret",
      );
      assert.equal(
        rows.find((row) => row.name === "another_site")!.secret,
        "https://unrelated.example",
      );
    }
  } finally {
    await db.close();
  }
});

test("an installation without the original site secret aborts the migration without changing its other secrets", async () => {
  const db = new PGlite();
  try {
    await db.exec(schema);
    await assert.rejects(
      db.exec(migration),
      /Existing scheduler site secret was not found/,
    );
    await db.exec("rollback");
    const { rows } = await db.query<{ secret: string }>(
      "select secret from vault.secrets where name='mbp_higgsfield_worker'",
    );
    assert.equal(rows[0].secret, "test-worker-secret");
    const count = await db.query<{ total: number }>(
      "select count(*)::int as total from vault.secrets",
    );
    assert.equal(count.rows[0].total, 2);
  } finally {
    await db.close();
  }
});
