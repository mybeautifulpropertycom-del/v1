import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  ARK_TASKS_URL,
  bytePlusModel,
  submitBytePlusGeneration,
  bytePlusGenerationStatus,
  normalizeArkTask,
  BytePlusRejectedError,
} from "../src/lib/byteplus-video";
import { sceneGenerationInput } from "../src/lib/higgsfield-film-worker";
import { validateModel } from "../src/lib/higgsfield-models";
import { videoEnabled } from "../src/lib/video-service";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
after(() => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
});
beforeEach(() => {
  process.env.ARK_API_KEY = "fake-byteplus-key";
  delete process.env.BYTEPLUS_VIDEO_MODEL;
  delete process.env.PROPERTY_VIDEO_ENABLED;
});
test("BytePlus scenes use saved photo content, no generated audio, and a configurable snapshotted model", () => {
  const model = validateModel(bytePlusModel());
  const input = sceneGenerationInput(model, {
    index: 0,
    image: "https://photos.example/front.webp",
    fingerprint: "a".repeat(64),
    category: "exterior",
    strength: 5,
    aerial: false,
    evening: false,
    motion: "push",
  });
  assert.equal(model.provider, "byteplus");
  assert.equal(model.endpoint, "dreamina-seedance-2-5-260628");
  assert.equal(model.output.path, "content.video_url");
  assert.equal(input.generate_audio, false);
  assert.equal(input.duration, 3);
  assert.equal(input.ratio, "16:9");
  assert.equal(input.resolution, "720p");
  const content = input.content as any[];
  assert.deepEqual(content[1], {
    type: "image_url",
    image_url: { url: "https://photos.example/front.webp" },
    role: "reference_image",
  });
  assert.match(content[0].text, /Preserve the original geometry/);
  assert.match(content[0].text, /Do not add people/);
  process.env.BYTEPLUS_VIDEO_MODEL = "future-model";
  assert.equal(bytePlusModel().endpoint, "future-model");
  assert.equal(model.endpoint, "dreamina-seedance-2-5-260628");
  assert.throws(() => validateModel({ ...model, provider: "unknown" }));
});
test("direct submission and polling use fixed Ark origin, bearer auth and no Higgsfield calls", async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer fake-byteplus-key",
    );
    assert.equal(init?.redirect, "error");
    if (calls === 1) {
      assert.equal(url, ARK_TASKS_URL);
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "dreamina-seedance-2-5-260628");
      assert.equal(body.callback_url, undefined);
      return Response.json({ id: "cgt-123" });
    }
    assert.equal(url, `${ARK_TASKS_URL}/cgt-123`);
    return Response.json({
      id: "cgt-123",
      status: "succeeded",
      content: { video_url: "https://cdn.example/video.mp4" },
    });
  };
  const submitted = await submitBytePlusGeneration(bytePlusModel().endpoint, {
    content: [],
  });
  assert.deepEqual(submitted, { request_id: "cgt-123", status: "queued" });
  const result = await bytePlusGenerationStatus(submitted.request_id);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.content, {
    video_url: "https://cdn.example/video.mp4",
  });
  assert.equal(calls, 2);
});
test("status responses are bounded and task identity is checked", async () => {
  for (const [status, mapped] of Object.entries({
    queued: "queued",
    running: "in_progress",
    succeeded: "completed",
    failed: "failed",
    cancelled: "cancelled",
    expired: "failed",
  })) {
    assert.equal(
      normalizeArkTask({ id: "task-1", status }, "task-1").status,
      mapped,
    );
  }
  assert.throws(() =>
    normalizeArkTask({ id: "wrong", status: "succeeded" }, "task-1"),
  );
  assert.throws(() => normalizeArkTask({ id: "task-1", status: "unknown" }));
  await assert.rejects(() => bytePlusGenerationStatus("../credentials"));
  globalThis.fetch = async () => new Response("x".repeat(512001));
  await assert.rejects(
    () => bytePlusGenerationStatus("task-1"),
    /exceeds the limit/,
  );
});
test("rejections differ from uncertain submissions and no POST is retried", async () => {
  for (const status of [400, 401, 402, 403, 404, 422, 429, 408, 500]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response("do not expose provider details", { status });
    };
    await assert.rejects(
      () => submitBytePlusGeneration("model", {}),
      (error: unknown) => {
        assert.equal(
          error instanceof BytePlusRejectedError,
          ![408, 500].includes(status),
        );
        assert.ok(
          error instanceof Error && !error.message.includes("provider details"),
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
test("BytePlus worker can be enabled independently while Higgsfield stays off", () => {
  process.env.HIGGSFIELD_ENABLED = "true";
  assert.equal(videoEnabled(), true);
  process.env.PROPERTY_VIDEO_ENABLED = "false";
  assert.equal(videoEnabled(), false);
  process.env.HIGGSFIELD_ENABLED = "false";
  process.env.PROPERTY_VIDEO_ENABLED = "true";
  assert.equal(videoEnabled(), true);
});

test("definitive rejection retains HTTP and safe provider code but never echoes raw provider text", async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "InvalidParameter.Duration",
          message: "secret signed URL and private prompt",
        },
      },
      { status: 400 },
    );
  await assert.rejects(
    submitBytePlusGeneration("model", {}),
    (error: unknown) => {
      assert.ok(error instanceof BytePlusRejectedError);
      assert.equal(error.httpStatus, 400);
      assert.equal(error.providerCode, "InvalidParameter.Duration");
      assert.doesNotMatch(error.message, /secret|signed|prompt/);
      return true;
    },
  );
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "secret https://private.example" } },
      { status: 429 },
    );
  await assert.rejects(
    submitBytePlusGeneration("model", {}),
    (error: unknown) => {
      assert.ok(error instanceof BytePlusRejectedError);
      assert.equal(error.httpStatus, 429);
      assert.equal(error.providerCode, undefined);
      return true;
    },
  );
});
