import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  runVideoWorker,
  workerDependencies,
  type VideoJob,
} from "../src/lib/higgsfield-worker";
import { callbackToken } from "../src/lib/higgsfield-security";
import { POST as webhook } from "../src/app/api/higgsfield/webhook/route";
import { POST as workerRoute } from "../src/app/api/video/worker/route";
import { BadInputError } from "@higgsfield/client";
const owner = "11111111-1111-4111-8111-111111111111",
  property = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  order = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const originalFetch = globalThis.fetch,
  originalDependencies = { ...workerDependencies };
let job: VideoJob & { provider_phase: string },
  submits = 0,
  downloads = 0,
  uploads = 0,
  paid = true,
  bound = true;
let advances: Record<string, unknown>[] = [];
beforeEach(() => {
  process.env.HIGGSFIELD_ENABLED = "true";
  process.env.HF_CREDENTIALS = "fake:secret";
  process.env.CRON_SECRET = "s".repeat(48);
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://worker-tests.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test-key";
  process.env.HIGGSFIELD_MODEL = "model-a";
  process.env.HIGGSFIELD_MODELS_JSON = JSON.stringify({
    "model-a": {
      endpoint: "vendor/a",
      input: { prompt: { $ref: "prompt" }, photo: { $ref: "images.0" } },
      output: { kind: "video", path: "video.url" },
    },
  });
  job = {
    order_id: order,
    owner_id: owner,
    property_id: property,
    status: "queued",
    attempts: 0,
    provider_phase: "ready",
    provider_request_id: null,
    lease_token: "",
    model_config: null as never,
    model_input: {},
    source: {
      title: "Garden home",
      images: [
        `https://worker-tests.supabase.co/storage/v1/object/public/property-images/${owner}/${property}/photo.jpg`,
      ],
    },
  };
  submits = downloads = uploads = 0;
  paid = bound = true;
  advances = [];
  workerDependencies.submitGeneration = async (endpoint, input, callback) => {
    submits++;
    assert.equal(endpoint, "vendor/a");
    assert.ok(String(input.photo).endsWith("photo.jpg"));
    assert.equal(
      new URL(callback).searchParams.get("token"),
      callbackToken(order, 1),
    );
    return { request_id: "request-1", status: "queued" };
  };
  workerDependencies.generationStatus = async (id) => ({
    request_id: id,
    status: "completed",
    video: { url: "https://cdn.example/video.mp4" },
  });
  workerDependencies.downloadVideo = async (url) => {
    downloads++;
    assert.equal(url, "https://cdn.example/video.mp4");
    return {
      bytes: Buffer.from("fake-video"),
      type: "video/mp4",
      extension: "mp4",
    };
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  Object.assign(workerDependencies, originalDependencies);
});
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  assert.equal(
    url.origin,
    "https://worker-tests.supabase.co",
    "Workers must not make unexpected external requests",
  );
  assert.equal(
    new Headers(init?.headers).get("authorization"),
    "Bearer server-test-key",
  );
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (url.pathname === "/rest/v1/property_video_jobs") {
    if (init?.method === "PATCH") return new Response(null, { status: 204 });
    return Response.json(
      url.searchParams.get("select")?.includes("attempts,status")
        ? job
        : ["queued", "processing"].includes(job.status) &&
            job.provider_phase !== "uncertain"
          ? [job]
          : [],
    );
  }
  if (url.pathname.endsWith("/claim_property_video")) {
    if (!paid) return Response.json(null);
    if (job.status === "queued") {
      job.attempts++;
      job.model_config = body.p_model;
      job.model_input = body.p_input;
    }
    job.lease_token = body.p_lease;
    job.status = "processing";
    return Response.json(job);
  }
  if (url.pathname.endsWith("/bind_property_video_request")) {
    if (!paid || !bound) return Response.json(false);
    job.provider_request_id = body.p_request;
    return Response.json(true);
  }
  if (url.pathname.endsWith("/advance_property_video")) {
    advances.push(body);
    if (!paid) return Response.json(false);
    job.provider_phase = body.p_phase;
    job.status =
      body.p_phase === "completed"
        ? "completed"
        : body.p_phase === "failed"
          ? "failed"
          : "processing";
    return Response.json(true);
  }
  if (url.pathname.startsWith("/storage/v1/object/property-videos/")) {
    uploads++;
    assert.ok(url.pathname.endsWith(`/${owner}/${order}/1.mp4`));
    return Response.json({ Key: "saved.mp4" });
  }
  throw new Error(`Unexpected route ${url.pathname}`);
};
test("paid job submits once, resumes its saved model after a configuration change, stores and publishes durable media", async () => {
  assert.deepEqual((await runVideoWorker()).results, ["processing"]);
  assert.equal(submits, 1);
  assert.equal(downloads, 0);
  process.env.HIGGSFIELD_MODEL = "a-different-or-removed-profile";
  assert.deepEqual((await runVideoWorker()).results, ["completed"]);
  assert.equal(submits, 1);
  assert.equal(downloads, 1);
  assert.equal(uploads, 1);
  assert.equal(
    advances.at(-1)?.p_url,
    `https://worker-tests.supabase.co/storage/v1/object/public/property-videos/${owner}/${order}/1.mp4`,
  );
  assert.equal((await runVideoWorker()).processed, 0);
});
test("ambiguous submission is held for reconciliation instead of being billed again", async () => {
  workerDependencies.submitGeneration = async () => {
    submits++;
    throw new Error("timeout");
  };
  assert.deepEqual((await runVideoWorker()).results, ["uncertain"]);
  assert.equal(submits, 1);
  await runVideoWorker();
  assert.equal(submits, 1);
});
test("explicit provider rejection is retryable, while revoked jobs never deliver a video", async () => {
  workerDependencies.submitGeneration = async () => {
    throw new BadInputError("rejected");
  };
  assert.deepEqual((await runVideoWorker()).results, ["failed"]);
  assert.equal(downloads, 0);
  job.status = "queued";
  paid = false;
  assert.equal((await runVideoWorker()).processed, 0);
  assert.equal(uploads, 0);
});
test("disabled generation and unauthorized scheduler calls never submit paid requests", async () => {
  process.env.HIGGSFIELD_ENABLED = "false";
  assert.deepEqual(await runVideoWorker(), { enabled: false, processed: 0 });
  assert.equal(
    (
      await workerRoute(
        new Request("https://app.example/api/video/worker", { method: "POST" }),
      )
    ).status,
    401,
  );
  assert.equal(submits, 0);
});
test("webhook rejects forged tokens and ignores callbacks for older attempts before contacting the provider", async () => {
  const fake = new Request(
    `https://app.example/api/higgsfield/webhook?order=${order}&attempt=1&token=wrong`,
    { method: "POST", body: "{}" },
  );
  assert.equal((await webhook(fake)).status, 401);
  job.attempts = 2;
  job.status = "processing";
  const stale = new Request(
    `https://app.example/api/higgsfield/webhook?order=${order}&attempt=1&token=${callbackToken(order, 1)}`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "completed",
        video: { url: "https://evil.example/fake.mp4" },
      }),
    },
  );
  assert.equal((await webhook(stale)).status, 200);
  assert.equal(downloads, 0);
});
