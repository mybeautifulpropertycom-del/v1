import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const agent = "11111111-1111-4111-8111-111111111111";
const legacy = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const listing = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
test("live billing gates direct database publication, preserves existing pages, and revokes purchases atomically", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   grant usage on schema public to anon,authenticated,service_role;
   create table profiles(id uuid primary key);
   create table properties(id uuid primary key,owner_id uuid,status text default 'draft');
   grant select,insert,update on properties to authenticated;
   insert into profiles values('${agent}');
   insert into properties values('${legacy}','${agent}','published'),('${listing}','${agent}','draft'),('${other}','${agent}','draft');`);
    const sql = await readFile(
      new URL("../supabase/sql-editor-stripe-live.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.activate_property_billing()"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update property_orders set status='paid'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update property_billing_settings set enabled=false"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `insert into property_legacy_access(property_id,owner_id) values('${listing}','${agent}')`,
      ),
      /permission denied/,
    );
    await db.exec("reset role; set role service_role");
    await db.query("select public.activate_property_billing()");
    await db.query("select public.activate_property_billing()");
    await db.exec("reset role; set role authenticated");
    await db.query(
      `update properties set status='published' where id='${legacy}'`,
    );
    await assert.rejects(
      db.query(
        `update properties set status='published' where id='${listing}'`,
      ),
      /PAYMENT_REQUIRED/,
    );
    await assert.rejects(
      db.query(
        `insert into properties values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${agent}','published')`,
      ),
      /PAYMENT_REQUIRED/,
    );
    await db.exec("reset role; set role service_role");
    await db.query(
      `select public.reserve_stripe_test_order('${listing}','${agent}')`,
    );
    await db.exec("update stripe_test_orders set status='paid'");
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.query(
        `update properties set status='published' where id='${listing}'`,
      ),
      /PAYMENT_REQUIRED/,
    );
    await db.exec("reset role; set role service_role");
    const purchase = await db.query<{ id: string }>(
      `select * from public.reserve_property_order('${listing}','${agent}')`,
    );
    const order = purchase.rows[0].id;
    const apply = (status: string, time: number) =>
      db.query("select apply_property_payment($1,$2,$3,$4)", [
        order,
        "pi_real_purchase",
        status,
        time,
      ]);
    await apply("paid", 100);
    await apply("paid", 100);
    await db.exec("update property_orders set video_status='delivered'");
    await apply("paid", 100);
    const video = await db.query<{ video_status: string }>(
      "select video_status from property_orders",
    );
    assert.equal(video.rows[0].video_status, "delivered");
    await db.exec("reset role; set role authenticated");
    await db.query(
      `update properties set status='published' where id='${listing}'`,
    );
    await db.query(
      `update properties set status='draft' where id='${listing}'`,
    );
    await db.query(
      `update properties set status='published' where id='${listing}'`,
    );
    await assert.rejects(
      db.query(`update properties set status='published' where id='${other}'`),
      /PAYMENT_REQUIRED/,
    );
    await db.exec("reset role; set role service_role");
    await apply("disputed", 200);
    await apply("paid", 100);
    assert.equal(
      (await db.query<{ status: string }>("select status from property_orders"))
        .rows[0].status,
      "disputed",
    );
    await apply("paid", 300);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ status: string }>(
          `select status from properties where id='${listing}'`,
        )
      ).rows[0].status,
      "draft",
    );
    await db.exec("set role authenticated");
    await db.query(
      `update properties set status='published' where id='${listing}'`,
    );
    await db.exec("reset role; set role service_role");
    await apply("refunded", 250);
    await apply("paid", 500);
    assert.equal(
      (await db.query<{ status: string }>("select status from property_orders"))
        .rows[0].status,
      "refunded",
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.query(
        `update properties set status='published' where id='${listing}'`,
      ),
      /PAYMENT_REQUIRED/,
    );
    await db.exec("reset role");
    await db.query(`delete from properties where id='${listing}'`);
    assert.equal(
      (
        await db.query<{ property_id: null }>(
          "select property_id from property_orders",
        )
      ).rows[0].property_id,
      null,
    );
  } finally {
    await db.close();
  }
});
