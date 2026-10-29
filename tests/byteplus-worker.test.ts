import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  runVideoWorker,
  videoConfiguration,
} from "../src/lib/higgsfield-worker";
import { bytePlusModel } from "../src/lib/byteplus-video";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let candidate: any, claimed: any[], patches: any[];
beforeEach(() => {
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.05";
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "15";
  process.env.PROPERTY_VIDEO_ENABLED = "true";
  process.env.HIGGSFIELD_ENABLED = "false";
  process.env.PROPERTY_VIDEO_MODE = "byteplus-montage";
  process.env.ARK_API_KEY = "fake-ark-key";
  process.env.OPENAI_API_KEY = "fake-openai-key";
  process.env.CRON_SECRET = "s".repeat(48);
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://byteplus-worker.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-server-key";
  delete process.env.HF_KEY;
  delete process.env.HF_CREDENTIALS;
  delete process.env.HF_API_KEY;
  delete process.env.HF_API_SECRET;
  claimed = [];
  patches = [];
  candidate = {
    order_id: "11111111-1111-4111-8111-111111111111",
    status: "queued",
    model_config: null,
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      url.origin,
      "https://byteplus-worker.supabase.co",
      "Selection must not submit any generation",
    );
    if (url.pathname === "/rest/v1/rpc/claim_byteplus_slot_checks")
      return Response.json([]);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.pathname === "/rest/v1/property_video_jobs") {
      if (init?.method === "PATCH") {
        patches.push(body);
        return new Response(null, { status: 204 });
      }
      return Response.json([candidate]);
    }
    assert.equal(url.pathname, "/rest/v1/rpc/claim_property_ai_film");
    claimed.push(body);
    return Response.json(null); // Another worker won; no paid request is allowed.
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
});
test("new films snapshot the Ark model without requiring Higgsfield credentials", async () => {
  assert.equal(videoConfiguration().provider, "byteplus");
  await runVideoWorker();
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].p_model.provider, "byteplus");
  assert.equal(claimed[0].p_model.endpoint, "dreamina-seedance-2-5-260628");
  assert.equal(patches.length, 0);
});
test("admin rebuilds using the existing montage engine snapshot the new provider", async () => {
  candidate.model_config = { engine: "higgsfield-montage-v1" };
  await runVideoWorker();
  assert.equal(claimed[0].p_model.provider, "byteplus");
});
test("a saved Ark film resumes on Ark after changing the default mode", async () => {
  candidate.status = "processing";
  candidate.model_config = {
    engine: "higgsfield-montage-v1",
    profile: bytePlusModel(),
  };
  process.env.PROPERTY_VIDEO_MODE = "higgsfield-montage";
  await runVideoWorker();
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].p_model, null);
  assert.equal(patches.length, 0);
});
test("old Higgsfield films pause rather than being resubmitted to BytePlus", async () => {
  candidate.status = "processing";
  candidate.model_config = {
    engine: "higgsfield-montage-v1",
    profile: {
      endpoint: "minimax/hailuo",
      input: {},
      output: { kind: "video", path: "video.url" },
    },
  };
  await runVideoWorker();
  assert.equal(claimed.length, 0);
  assert.match(patches[0].last_error, /Higgsfield is paused/);
});
test("missing Ark credentials defer the job before reservation", async () => {
  delete process.env.ARK_API_KEY;
  await runVideoWorker();
  assert.equal(claimed.length, 0);
  assert.match(patches[0].last_error, /ARK_API_KEY/);
});
test("disabled shared worker performs no database or provider calls", async () => {
  process.env.PROPERTY_VIDEO_ENABLED = "false";
  globalThis.fetch = async () => {
    throw new Error("Unexpected request");
  };
  assert.deepEqual(await runVideoWorker(), { enabled: false, processed: 0 });
});

test("a missing shared queue migration stops before any film claim or paid submission", async () => {
  const read = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/rpc/claim_byteplus_slot_checks"))
      return Response.json({ message: "Function unavailable" }, { status: 404 });
    return read(input, init);
  };
  const result = await runVideoWorker();
  assert.equal(result.processed, 0);
  assert.deepEqual(result.results, ["queue_upgrade_required"]);
  assert.equal(claimed.length, 0);
});

test("unknown pricing pauses before even claiming a film", async () => {
  delete process.env.BYTEPLUS_VIDEO_USD_PER_SECOND;
  await runVideoWorker();
  assert.equal(claimed.length, 0);
  assert.match(patches[0].last_error, /verified BytePlus/);
});
