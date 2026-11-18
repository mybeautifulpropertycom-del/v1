import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("promotion money is server-only, owner-isolated, idempotent and never grants publication or live test campaigns", async () => {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    p = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    draft = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create table public.profiles(id uuid primary key); create table public.properties(id uuid primary key,owner_id uuid,status text);
      insert into profiles values('${a}'),('${b}'); insert into properties values('${p}','${a}','published'),('${draft}','${a}','draft');
      grant select on public.properties to service_role;`);
    const sql = await readFile(
      new URL("../supabase/sql-editor-promotions.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const reserve = (
      listing: string,
      owner: string,
      offer: string,
      live: boolean,
    ) =>
      db.query<{ id: string; amount: number }>(
        "select * from reserve_promotion_order($1,$2,$3,$4,'Brașov','', $5::jsonb)",
        [listing, owner, offer, live, JSON.stringify({ title: "Casă" })],
      );
    await db.exec(`set role authenticated; set app.user_id='${a}';`);
    await assert.rejects(reserve(p, a, "start", true), /permission denied/);
    await assert.rejects(
      db.exec("insert into promotion_orders default values"),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role;");
    await assert.rejects(reserve(p, b, "start", true), /not available/);
    await assert.rejects(reserve(draft, a, "start", true), /not available/);
    await assert.rejects(
      reserve(p, a, "forged", true),
      /Invalid promotion package/,
    );
    const first = (await reserve(p, a, "start", true)).rows[0];
    assert.equal(first.amount, 30000);
    assert.equal((await reserve(p, a, "plus", true)).rows[0].id, first.id);
    const sandbox = (await reserve(p, a, "extended", false)).rows[0];
    assert.equal(sandbox.amount, 100000);
    assert.notEqual(first.id, sandbox.id);
    await db.exec(
      `reset role; set role authenticated; set app.user_id='${b}';`,
    );
    assert.equal(
      (await db.query("select * from promotion_orders")).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("update promotion_orders set payment_status='paid'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select apply_promotion_payment($1,'pi_forged','paid',0,1)", [
        first.id,
      ]),
      /permission denied/,
    );
    await db.exec(`set app.user_id='${a}';`);
    assert.equal(
      (await db.query("select * from promotion_orders")).rows.length,
      2,
    );
    await db.exec("reset role; set role service_role;");
    const update = (
      id: string,
      state: string,
      spent = 0,
      report = "Raport real",
      campaign = "123456",
    ) =>
      db.query(
        "select * from update_promotion_campaign($1,$2,$3,100,4,$4,$5)",
        [id, state, spent, report, campaign],
      );
    await assert.rejects(update(first.id, "active"), /real confirmed payment/);
    await db.query(
      "select apply_promotion_payment($1,'pi_sandbox','paid',0,100)",
      [sandbox.id],
    );
    await assert.rejects(
      update(sandbox.id, "active"),
      /real confirmed payment/,
    );
    await db.query(
      "select apply_promotion_payment($1,'pi_real','paid',0,100)",
      [first.id],
    );
    await assert.rejects(update(first.id, "active", 0, "", ""), /campaign ID/);
    await update(first.id, "active", 10000);
    await db.exec(
      `reset role; update properties set status='draft' where id='${p}'; set role service_role;`,
    );
    assert.deepEqual(
      (
        await db.query(
          "select stop_required,stop_reason from promotion_orders where id=$1",
          [first.id],
        )
      ).rows[0],
      { stop_required: true, stop_reason: "withdrawn" },
    );
    await assert.rejects(update(first.id, "active"), /must remain published/);
    await db.exec(
      `reset role; update properties set status='published' where id='${p}'; set role service_role;`,
    );
    await assert.rejects(
      update(first.id, "active"),
      /stopped in Google Ads first/,
    );
    await update(first.id, "stopped", 10000);
    await update(first.id, "active", 10000);
    await assert.rejects(
      update(first.id, "completed", 30001),
      /check constraint/,
    );
    await assert.rejects(
      update(first.id, "completed", 20000, ""),
      /campaign report/,
    );
    await db.query(
      "select apply_promotion_payment($1,'pi_real','refunded',30000,200)",
      [first.id],
    );
    let row = (
      await db.query<{ payment_status: string; stop_required: boolean }>(
        "select payment_status,stop_required from promotion_orders where id=$1",
        [first.id],
      )
    ).rows[0];
    assert.deepEqual(row, { payment_status: "refunded", stop_required: true });
    await db.query(
      "select apply_promotion_payment($1,'pi_real','paid',0,150)",
      [first.id],
    );
    await db.query(
      "select apply_promotion_payment($1,'pi_real','paid',0,300)",
      [first.id],
    );
    await assert.rejects(update(first.id, "active"), /real confirmed payment/);
    await update(first.id, "stopped", 10000);
    row = (
      await db.query<typeof row>(
        "select payment_status,stop_required from promotion_orders where id=$1",
        [first.id],
      )
    ).rows[0];
    assert.deepEqual(row, { payment_status: "refunded", stop_required: false });
    // A refund does not withdraw a property or affect video/publication tables.
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from properties where id=$1",
          [p],
        )
      ).rows[0].status,
      "published",
    );
    const sold = (await reserve(p, a, "plus", true)).rows[0];
    await db.query(
      "select apply_promotion_payment($1,'pi_sold','paid',0,100)",
      [sold.id],
    );
    await update(sold.id, "active");
    await db.exec(
      `reset role; set role authenticated; set app.user_id='${b}';`,
    );
    await assert.rejects(
      db.query("select request_promotion_stop($1,'sold')", [sold.id]),
      /unavailable/,
    );
    await db.exec(`set app.user_id='${a}';`);
    await db.query("select request_promotion_stop($1,'sold')", [sold.id]);
    assert.deepEqual(
      (
        await db.query(
          "select stop_required,stop_reason,payment_status from promotion_orders where id=$1",
          [sold.id],
        )
      ).rows[0],
      { stop_required: true, stop_reason: "sold", payment_status: "paid" },
    );
    await db.exec("reset role; set role service_role;");
    await assert.rejects(
      update(sold.id, "queued"),
      /stopped in Google Ads first/,
    );
    await update(sold.id, "stopped");
    await assert.rejects(update(sold.id, "active"), /agent requested stopping/);
    const deleted = (await reserve(p, a, "extended", true)).rows[0];
    await db.query(
      "select apply_promotion_payment($1,'pi_deleted','paid',0,100)",
      [deleted.id],
    );
    await update(deleted.id, "active");
    await db.exec(
      `reset role; delete from properties where id='${p}'; delete from profiles where id='${a}';`,
    );
    assert.equal(
      (
        await db.query(
          "select * from promotion_orders where owner_id is null and property_id is null",
        )
      ).rows.length,
      4,
    );
    assert.deepEqual(
      (
        await db.query(
          "select stop_required,stop_reason from promotion_orders where id=$1",
          [deleted.id],
        )
      ).rows[0],
      { stop_required: true, stop_reason: "deleted" },
    );
    await db.exec("set role anon;");
    await assert.rejects(
      db.query("select * from promotion_orders"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
