import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("Stripe test orders are server-only, idempotent, and never grant publication", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.profiles(id uuid primary key);
      create table public.properties(id uuid primary key, owner_id uuid, status text default 'draft');
      insert into profiles values ('11111111-1111-4111-8111-111111111111');
      insert into properties(id,owner_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');`);
    const sql = await readFile(
      new URL("../supabase/sql-editor-stripe-test.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const reserve =
      "select * from public.reserve_stripe_test_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111')";
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query(reserve), /permission denied/i);
      await assert.rejects(
        db.query("select * from public.stripe_test_orders"),
        /permission denied/i,
      );
      await assert.rejects(
        db.query("update public.stripe_test_orders set status='paid'"),
        /permission denied/i,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(
      db.query(
        "select * from public.reserve_stripe_test_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222')",
      ),
      /Property not available/,
    );
    const first = await db.query(reserve);
    const second = await db.query(reserve);
    assert.deepEqual(first.rows, second.rows);
    await db.exec(
      "update public.stripe_test_orders set expires_at=now()-interval '1 minute'",
    );
    const retry = await db.query<{ attempt: number }>(reserve);
    assert.equal(retry.rows[0].attempt, 2);
    await db.exec(
      "update public.stripe_test_orders set status='paid', expires_at=now()-interval '1 minute'",
    );
    const paid = await db.query<{ attempt: number; status: string }>(reserve);
    assert.equal(paid.rows[0].attempt, 2);
    assert.equal(paid.rows[0].status, "paid");
    await db.exec("reset role");
    const property = await db.query<{ status: string }>(
      "select status from public.properties",
    );
    assert.equal(property.rows[0].status, "draft");
    await db.exec("delete from public.properties");
    const receipt = await db.query<{ property_id: null; status: string }>(
      "select property_id,status from public.stripe_test_orders",
    );
    assert.deepEqual(receipt.rows, [{ property_id: null, status: "paid" }]);
  } finally {
    await db.close();
  }
});
