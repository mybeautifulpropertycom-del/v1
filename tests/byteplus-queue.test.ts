import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runVideoQueueBatch,
  refreshBytePlusCapacity,
  bytePlusQueueDependencies,
} from "../src/lib/byteplus-queue";

test("ten properties share three durable slots, rotate fairly, retain orphan requests and back off on an explicit 429", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema storage;
   create table auth.users (id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
   grant usage on schema auth,public,storage to anon,authenticated;
   create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects (id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant select,insert,delete on storage.objects to authenticated;
   create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  `);
    for (const name of [
      "sql-editor-setup.sql",
      "sql-editor-byteplus-queue.sql",
      "sql-editor-byteplus-queue.sql",
    ]) {
      await db.exec(
        await readFile(new URL("../supabase/" + name, import.meta.url), "utf8"),
      );
    }
    const actor = "11111111-1111-4111-8111-111111111111";
    await db.query(
      "insert into auth.users(id,email) values($1,'admin@example.com')",
      [actor],
    );
    await db.exec(
      "update profiles set name='Agent',phone='+1 555 123 4567'; select grant_platform_admin('admin@example.com'); select activate_property_billing()",
    );
    const model = {
      provider: "byteplus",
      endpoint: "dreamina-seedance-2-5-260628",
      input: { duration: 4, resolution: "720p", generate_audio: false },
    };
    const plan = {
      engine: "higgsfield-montage-v1",
      shots: [{ seconds: 4 }, { seconds: 4 }, { seconds: 4 }],
      generationBudget: { version: 3, sceneSeconds: [4, 4, 4] },
    };
    const input = { duration: 4, resolution: "720p", generate_audio: false };
    const jobs: any[] = [];
    const rpc = async (name: string, args: unknown[]) =>
      (
        await db.query<any>(
          `select ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
          args,
        )
      ).rows[0].value;
    for (let i = 0; i < 10; i++) {
      const property = `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`;
      await db.query(
        "insert into properties(id,owner_id,slug,title,description,location,price,area,images) values($1,$2,$3,'A home','A detailed home description for a cinematic film.','Austin',500000,1500,array['https://example.com/front.jpg'])",
        [property, actor, "queued-home-" + i],
      );
      await rpc("admin_publish_property", [property, actor, "Showcase"]);
      const order = (
        await db.query<any>(
          "select id from property_orders where property_id=$1",
          [property],
        )
      ).rows[0].id;
      const lease = `bbbbbbbb-bbbb-4bbb-8bbb-${String(i + 1).padStart(12, "0")}`;
      const job = await rpc("claim_property_ai_film", [
        order,
        lease,
        JSON.stringify(model),
      ]);
      await rpc("checkpoint_property_ai_film", [
        order,
        lease,
        1,
        JSON.stringify(plan),
      ]);
      await rpc("claim_property_ai_film", [order, lease, null]);
      jobs.push({ ...job, property, lease });
    }
    const reserve = (i: number) =>
      rpc("reserve_property_film_scene", [
        jobs[i].order_id,
        jobs[i].lease,
        1,
        JSON.stringify(input),
      ]);
    const bind = (i: number, id: string) =>
      rpc("bind_property_film_scene", [
        jobs[i].order_id,
        jobs[i].montage_generation,
        0,
        id,
      ]);
    const active = async () =>
      Number(
        (
          await db.query<any>(
            "select count(*) as n from byteplus_scene_slots where active",
          )
        ).rows[0].n,
      );
    await db.exec("set role service_role");
    const reserved = await Promise.all(jobs.map((_, i) => reserve(i)));
    assert.equal(
      reserved.filter(Boolean).length,
      3,
      "Overlapping publishers share a single cap",
    );
    assert.equal(await active(), 3);
    for (let i = 0; i < 3; i++) await bind(i, "task-" + i);
    assert.equal(
      await reserve(0).then((r) => r.submit),
      false,
      "Accepted tasks are reused at full capacity",
    );
    await rpc("finish_byteplus_scene_slot", ["task-0"]);
    assert.equal(
      await rpc("reserve_byteplus_lookahead", [
        jobs[0].order_id,
        jobs[0].lease,
        1,
        1,
        JSON.stringify(input),
      ]),
      null,
      "A second scene yields to a waiting property",
    );
    assert.equal((await reserve(3)).submit, true);
    assert.equal(await active(), 3);
    assert.equal(
      await rpc("reject_byteplus_scene", [
        jobs[3].order_id,
        jobs[3].lease,
        1,
        jobs[3].montage_generation,
        0,
        429,
      ]),
      true,
    );
    assert.equal(await active(), 2);
    assert.equal(
      await reserve(4),
      null,
      "Provider cooldown applies to all agents",
    );
    const deferred = (
      await db.query<any>(
        "select status,attempts,montage_failures,last_error from property_video_jobs where order_id=$1",
        [jobs[3].order_id],
      )
    ).rows[0];
    assert.deepEqual(deferred, {
      status: "processing",
      attempts: 1,
      montage_failures: 0,
      last_error: null,
    });
    await db.exec(
      "reset role; update byteplus_queue_settings set cooldown_until=now()-interval '1 second'; set role service_role",
    );
    assert.equal((await reserve(4)).submit, true);
    assert.equal(await active(), 3);
    assert.equal(
      await rpc("reject_byteplus_scene", [
        jobs[4].order_id,
        jobs[4].lease,
        1,
        jobs[4].montage_generation,
        0,
        500,
      ]),
      false,
      "Ambiguous responses cannot release capacity",
    );
    assert.equal(await active(), 3);
    // A deleted listing must not make an already accepted provider task disappear from the cap.
    await db.exec("reset role");
    await db.query("delete from properties where id=$1", [jobs[2].property]);
    assert.equal(await active(), 3);
    await db.exec("set role service_role");
    const checks = await rpc("claim_byteplus_slot_checks", []);
    assert.ok(checks.some((s: any) => s.request_id === "task-2"));
    assert.equal(
      checks.some((s: any) => s.request_id === null),
      false,
      "Unknown submissions stay reserved",
    );
    assert.deepEqual(
      await rpc("claim_byteplus_slot_checks", []),
      [],
      "Concurrent schedulers cannot duplicate capacity polling",
    );
    await rpc("finish_byteplus_scene_slot", ["task-2"]);
    assert.equal(await active(), 2);
    await db.exec(
      "reset role; update property_video_jobs set byteplus_last_dispatch=now() where order_id='" +
        jobs[0].order_id +
        "'; set role service_role",
    );
    await rpc("checkpoint_property_ai_film", [
      jobs[0].order_id,
      jobs[0].lease,
      1,
      null,
      0,
    ]);
    await rpc("claim_property_ai_film", [
      jobs[0].order_id,
      jobs[0].lease,
      null,
    ]);
    assert.equal(
      await reserve(0),
      null,
      "Finishing a scene does not jump ahead of older waiting properties",
    );
    assert.equal((await reserve(5)).submit, true);
    assert.equal(await active(), 3);
    // Agents cannot increase the quota, release slots, or erase uncertain reservations.
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.exec("update byteplus_queue_settings set max_active=10"),
      /permission denied/,
    );
    await assert.rejects(
      rpc("finish_byteplus_scene_slot", ["task-1"]),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("delete from byteplus_scene_slots"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("the worker advances ten properties with three local lanes and isolates a broken property", async () => {
  let active = 0,
    max = 0;
  const visited: number[] = [];
  const result = await runVideoQueueBatch(
    Array.from({ length: 10 }, (_, i) => i),
    async (i) => {
      active++;
      max = Math.max(max, active);
      visited.push(i);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      if (i === 2) throw new Error("one broken property");
      return ["generating"];
    },
  );
  assert.equal(max, 3);
  assert.equal(visited.length, 10);
  assert.equal(result.length, 10);
  assert.equal(result.filter((v) => v === "worker_deferred").length, 1);
});

test("shared deadline prevents starting another expensive property near the route timeout", async () => {
  let clock = 0;
  const visited: number[] = [];
  await runVideoQueueBatch(
    [0, 1, 2, 3, 4, 5],
    async (i) => {
      visited.push(i);
      clock = 60001;
      return ["planned"];
    },
    () => clock,
  );
  assert.deepEqual(visited, [0]);
});

test("capacity checks release only confirmed terminal provider tasks, never a timeout or running task", async () => {
  const original = bytePlusQueueDependencies.status;
  const released: string[] = [];
  try {
    bytePlusQueueDependencies.status = async (id) => {
      if (id === "unknown") throw new Error("timeout");
      return {
        request_id: id,
        status: id === "done" ? "completed" : "in_progress",
      };
    };
    const admin = {
      rpc: async (name: string, args: any) => {
        if (name === "claim_byteplus_slot_checks")
          return {
            data: ["done", "running", "unknown"].map((request_id) => ({
              request_id,
            })),
            error: null,
          };
        assert.equal(name, "finish_byteplus_scene_slot");
        released.push(args.p_request);
        return { data: true, error: null };
      },
    } as unknown as SupabaseClient;
    await refreshBytePlusCapacity(admin);
    assert.deepEqual(released, ["done"]);
  } finally {
    bytePlusQueueDependencies.status = original;
  }
});
