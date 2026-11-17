import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("package tariffs, administrator grants and paid fulfilment cannot create video work for a photo-only purchase", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const actor = "22222222-2222-4222-8222-222222222222";
  const ids = Array.from(
    { length: 7 },
    (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
  );
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
      grant usage on schema auth,public,storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const upgradeName = "202611170001_publication_packages.sql";
    for (const name of (await readdir(directory))
      .sort()
      .filter((name) => name.endsWith(".sql") && name !== upgradeName))
      await db.exec(await readFile(new URL(name, directory), "utf8"));
    await db.query(
      "insert into auth.users(id,email) values($1,'agent@example.com'),($2,'admin@example.com')",
      [owner, actor],
    );
    await db.exec("update profiles set name='Agent Test',phone='+40755436284'");
    for (const [index, id] of ids.entries())
      await db.query(
        "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,$3,'Locuința test','O locuință de test cu spațiu pentru întreaga familie.','Strada Test 9, București',850000,302,array['https://example.com/home.jpg'])",
        [id, owner, `test-package-${index}`],
      );
    await db.query("select grant_platform_admin('admin@example.com')");
    await db.query("select activate_property_billing()");
    await db.query("select reserve_property_order($1,$2)", [ids[0], owner]);
    await db.query(
      "update property_orders set checkout_session_id='cs_existing' where property_id=$1",
      [ids[0]],
    );
    const upgrade = await readFile(new URL(upgradeName, directory), "utf8");
    // Simulate the separate checks retained by some earlier manual upgrades.
    await db.exec(
      "alter table property_orders add constraint property_orders_amount_check check(amount in (24900,9700)); alter table stripe_test_orders add constraint stripe_test_orders_amount_check check(amount in (24900,9700));",
    );
    await db.exec(upgrade);
    await db.exec(upgrade);
    const existing = (
      await db.query<any>(
        "select * from property_orders where property_id=$1",
        [ids[0]],
      )
    ).rows[0];
    assert.equal(existing.amount, 24900);
    assert.equal(existing.includes_video, true);
    assert.equal(existing.checkout_session_id, "cs_existing");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select reserve_property_order($1,$2,false)", [ids[1], owner]),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "select admin_publish_property($1,$2,'Test',null,null,false)",
          [ids[2], actor],
        ),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    const reserve = async (id: string, video: boolean) =>
      (
        await db.query<any>(
          "select request_property_publication($1,$2,$3) as result",
          [id, owner, video],
        )
      ).rows[0].result;
    const photo = await reserve(ids[1], false);
    assert.equal(photo.order.amount, 14900);
    assert.equal(photo.order.includes_video, false);
    await db.query("select apply_property_payment($1,'pi_photo','paid',100)", [
      photo.order.id,
    ]);
    await db.query("select apply_property_payment($1,'pi_photo','paid',100)", [
      photo.order.id,
    ]);
    assert.equal(
      (
        await db.query<any>("select status from properties where id=$1", [
          ids[1],
        ])
      ).rows[0].status,
      "published",
    );
    assert.equal(
      (
        await db.query<any>(
          "select video_status from property_orders where id=$1",
          [photo.order.id],
        )
      ).rows[0].video_status,
      "not_ordered",
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as n from property_video_jobs where order_id=$1",
          [photo.order.id],
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into property_video_jobs(order_id,property_id,owner_id,source) values($1,$2,$3,'{}')",
        [photo.order.id, ids[1], owner],
      ),
      /nu include videoclip/,
    );
    await assert.rejects(
      db.query(
        "update property_orders set includes_video=true,amount=24900 where id=$1",
        [photo.order.id],
      ),
      /nu poate fi schimbat/,
    );
    const republish = await reserve(ids[1], true);
    assert.equal(republish.videoIncluded, false);
    const publicPhoto = (
      await db.query<any>(
        "select get_public_property('test-package-1') as page",
      )
    ).rows[0].page;
    assert.equal(publicPhoto.videoIncluded, false);
    assert.equal(publicPhoto.film, null);
    assert.equal(publicPhoto.property.owner_id, undefined);
    const adminPhoto = (
      await db.query<any>(
        "select admin_publish_property($1,$2,'Fără videoclip',null,null,false) as result",
        [ids[2], actor],
      )
    ).rows[0].result;
    assert.equal(adminPhoto.published, true);
    assert.equal(adminPhoto.videoIncluded, false);
    assert.equal(adminPhoto.paid, false);
    const video = await reserve(ids[3], true);
    assert.equal(video.order.amount, 24900);
    await db.query("select apply_property_payment($1,'pi_video','paid',100)", [
      video.order.id,
    ]);
    await db.query("select apply_property_payment($1,'pi_video','paid',100)", [
      video.order.id,
    ]);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as n from property_video_jobs where order_id=$1",
          [video.order.id],
        )
      ).rows[0].n,
      1,
    );
    const adminVideo = (
      await db.query<any>(
        "select admin_publish_property($1,$2,'Cu videoclip',null,null,true) as result",
        [ids[4], actor],
      )
    ).rows[0].result;
    assert.equal(adminVideo.videoIncluded, true);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as n from property_video_jobs where property_id=$1",
          [ids[4]],
        )
      ).rows[0].n,
      1,
    );
    const switching = await reserve(ids[5], true);
    await db.query(
      "update property_orders set checkout_session_id='cs_open' where id=$1",
      [switching.order.id],
    );
    const fenced = await reserve(ids[5], false);
    assert.equal(
      fenced.order.includes_video,
      true,
      "An open session is never repriced by reservation",
    );
    await assert.rejects(
      db.query(
        "select change_publication_package($1,$2,false,99,'cs_open',false)",
        [ids[5], owner],
      ),
      /s-a schimbat/,
    );
    const changed = (
      await db.query<any>(
        "select change_publication_package($1,$2,false,$3,'cs_open',false) as result",
        [ids[5], owner, switching.order.attempt],
      )
    ).rows[0].result;
    assert.equal(changed.amount, 14900);
    assert.equal(changed.checkout_session_id, null);
    assert.equal(changed.attempt, switching.order.attempt + 1);
    await db.exec(upgrade);
    assert.equal(
      (
        await db.query<any>("select amount from property_orders where id=$1", [
          photo.order.id,
        ])
      ).rows[0].amount,
      14900,
    );
  } finally {
    await db.close();
  }
});
