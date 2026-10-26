import assert from "node:assert/strict";
import { after, test } from "node:test";
import axios, { AxiosError } from "axios";
import {
  configuredModel,
  modelEndpoint,
  resolveModelInput,
  propertyVideoInput,
  validateModel,
} from "../src/lib/higgsfield-models";
import {
  generationStatus,
  submitGeneration,
  higgsfieldCredentials,
} from "../src/lib/higgsfield-server";
import { callbackToken, safeEqual } from "../src/lib/higgsfield-security";
import { mediaType, publicIPv4 } from "../src/lib/video-download";
const owner = "11111111-1111-4111-8111-111111111111",
  property = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalAdapter = axios.defaults.adapter,
  originalFetch = globalThis.fetch;
after(() => {
  axios.defaults.adapter = originalAdapter;
  globalThis.fetch = originalFetch;
});

test("model profiles accept different schemas and preserve arrays/numbers without core model branches", () => {
  process.env.HIGGSFIELD_MODEL = "custom-model";
  process.env.HIGGSFIELD_MODELS_JSON = JSON.stringify({
    "custom-model": {
      endpoint: "vendor/new-model/image-to-video",
      input: {
        references: { $ref: "images" },
        duration: 12,
        options: { camera: "slow" },
        prompt: { $ref: "prompt" },
      },
      output: { kind: "video", path: "outputs.0.url" },
    },
  });
  const profile = configuredModel();
  assert.equal(profile.endpoint, "vendor/new-model/image-to-video");
  assert.deepEqual(
    resolveModelInput(profile, {
      images: ["a", "b"],
      prompt: "Exact property",
    }),
    {
      references: ["a", "b"],
      duration: 12,
      options: { camera: "slow" },
      prompt: "Exact property",
    },
  );
  assert.throws(() => resolveModelInput(profile, { images: [] }), /Missing/);
  for (const bad of [
    "https://evil.example/path",
    "//evil.example",
    "a/../b",
    "a?key=secret",
    "a/%2e%2e/b",
    "a\\b",
  ])
    assert.throws(() => modelEndpoint(bad));
  assert.throws(() =>
    resolveModelInput(
      validateModel({ ...profile, input: { value: { $ref: "__proto__.x" } } }),
      {},
    ),
  );
});
test("property input uses only saved owned photos and does not send agent contact details", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://hf-test.supabase.co";
  const profile = validateModel({
    endpoint: "model/video",
    input: { photos: { $ref: "image_objects" }, prompt: { $ref: "prompt" } },
    output: { kind: "video", path: "video.url" },
  });
  const images = [
    `https://hf-test.supabase.co/storage/v1/object/public/property-images/${owner}/${property}/cover.jpg`,
  ];
  const input = propertyVideoInput(
    profile,
    { images, title: "A garden home", email: "private@example.com" },
    owner,
    property,
  );
  assert.deepEqual(input.photos, [{ type: "image_url", image_url: images[0] }]);
  assert.ok(!JSON.stringify(input).includes("private@example.com"));
  assert.throws(() =>
    propertyVideoInput(
      profile,
      { images: ["https://evil.example/photo"] },
      owner,
      property,
    ),
  );
});
test("official SDK submits arbitrary model inputs once, returns raw image/video fields, and does not wait for rendering", async () => {
  process.env.HF_CREDENTIALS = "fake-key:fake-secret";
  let calls = 0;
  axios.defaults.adapter = async (config) => {
    calls++;
    assert.equal(config.baseURL, "https://api.higgsfield.ai");
    assert.equal(config.headers.Authorization, "Key fake-key:fake-secret");
    assert.equal(
      config.url,
      "/vendor/model/text-to-image?hf_webhook=https%3A%2F%2Fapp.example%2Fcallback",
    );
    assert.deepEqual(JSON.parse(config.data), {
      width: 1024,
      prompt: "A home",
    });
    return {
      config,
      status: 200,
      statusText: "OK",
      headers: {},
      data: {
        request_id: "request-1",
        status: "completed",
        images: [{ url: "https://cdn.example/image.png" }],
      },
    };
  };
  const result = await submitGeneration(
    "vendor/model/text-to-image",
    { width: 1024, prompt: "A home" },
    "https://app.example/callback",
  );
  assert.deepEqual(result.images, [{ url: "https://cdn.example/image.png" }]);
  assert.equal(calls, 1);
  axios.defaults.adapter = async (config) => {
    calls++;
    throw new AxiosError("timed out", "ETIMEDOUT", config);
  };
  await assert.rejects(
    submitGeneration(
      "vendor/model/image-to-video",
      {},
      "https://app.example/callback",
    ),
  );
  assert.equal(
    calls,
    2,
    "Ambiguous paid submissions are never automatically repeated",
  );
});
test("status resume uses only the fixed authenticated API host and checks request identity", async () => {
  process.env.HF_CREDENTIALS = "fake-key:fake-secret";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.higgsfield.ai/requests/request-1/status");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Key fake-key:fake-secret",
    );
    assert.equal(init?.redirect, "error");
    return Response.json({
      request_id: "request-1",
      status: "completed",
      video: { url: "https://cdn.example/video.mp4" },
    });
  };
  assert.equal((await generationStatus("request-1")).status, "completed");
  await assert.rejects(generationStatus("../other"));
  globalThis.fetch = async () =>
    Response.json({ request_id: "wrong", status: "completed" });
  await assert.rejects(generationStatus("request-1"), /identity/);
});
test("credentials and callbacks stay server-only and per-attempt tokens cannot be replayed across jobs", () => {
  process.env.HF_CREDENTIALS = "not-a-pair";
  assert.throws(higgsfieldCredentials, /not configured/);
  process.env.CRON_SECRET = "x".repeat(48);
  assert.ok(safeEqual(callbackToken(property, 1), callbackToken(property, 1)));
  assert.ok(!safeEqual(callbackToken(property, 1), callbackToken(property, 2)));
  assert.ok(!safeEqual(callbackToken(property, 1), callbackToken(owner, 1)));
  assert.ok(!safeEqual("short", callbackToken(property, 1)));
});
test("media import rejects private/special addresses and HTML masquerading as video", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.0.1",
    "100.64.0.1",
    "0.0.0.0",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "999.0.0.1",
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4("8.8.8.8"), true);
  assert.throws(() => mediaType(Buffer.from("<html>not a video</html>")));
  assert.equal(
    mediaType(
      Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]),
    ).extension,
    "mp4",
  );
});

test("single dashboard key is sent verbatim for submission and status without an invented secret", async () => {
  process.env.HF_KEY = "opaque-dashboard-key-for-tests";
  // An old variable must not override the explicitly installed current key.
  process.env.HF_CREDENTIALS = "old-id:old-secret";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Key opaque-dashboard-key-for-tests",
    );
    assert.equal(init?.redirect, "error");
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.higgsfield.ai");
    if (init?.method === "POST") {
      assert.equal(url.pathname, "/vendor/model/video");
      assert.equal(
        url.searchParams.get("hf_webhook"),
        "https://app.example/callback",
      );
      assert.deepEqual(JSON.parse(String(init.body)), { prompt: "A property" });
    } else assert.equal(url.pathname, "/requests/single-key-request/status");
    return Response.json({
      request_id: "single-key-request",
      status: "queued",
    });
  };
  try {
    assert.equal(higgsfieldCredentials(), process.env.HF_KEY);
    await submitGeneration(
      "vendor/model/video",
      { prompt: "A property" },
      "https://app.example/callback",
    );
    await generationStatus("single-key-request");
    assert.equal(calls, 2);
    process.env.HF_KEY = "unsafe\r\nheader";
    assert.throws(higgsfieldCredentials, /not configured/);
  } finally {
    delete process.env.HF_KEY;
  }
});

test("single-key submissions never retry ambiguous errors and classify definite input rejections", async () => {
  process.env.HF_KEY = "opaque-test-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("provider failure", { status: 500 });
  };
  try {
    await assert.rejects(
      submitGeneration("vendor/model", {}, "https://app.example/callback"),
      /confirmation is unavailable/,
    );
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response("private provider details", { status: 422 });
    await assert.rejects(
      submitGeneration("vendor/model", {}, "https://app.example/callback"),
      (error) => {
        assert.equal((error as Error).constructor.name, "ValidationError");
        assert.ok(
          !(error as Error).message.includes("private provider details"),
        );
        return true;
      },
    );
  } finally {
    delete process.env.HF_KEY;
  }
});
