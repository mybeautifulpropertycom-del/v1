import assert from "node:assert/strict";
import { after, test } from "node:test";
import { filmCallbackToken } from "../src/lib/higgsfield-security";
import { POST } from "../src/app/api/higgsfield/film-webhook/route";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://callback-tests.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
process.env.HF_KEY = "hf_test_opaque";
process.env.CRON_SECRET = "c".repeat(48);
const order = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  generation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
let requests: string[] = [],
  bound: unknown = null,
  wrongRequest = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  requests.push(url.hostname + url.pathname);
  if (url.hostname === "api.higgsfield.ai") {
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Key hf_test_opaque",
    );
    assert.equal(url.pathname, "/requests/request_one/status");
    return Response.json({
      request_id: wrongRequest ? "request_other" : "request_one",
      status: "queued",
    });
  }
  assert.equal(url.hostname, "callback-tests.supabase.co");
  if (url.pathname === "/rest/v1/property_film_scenes")
    return Response.json({ request_id: null, status: "uncertain" });
  assert.equal(url.pathname, "/rest/v1/rpc/bind_property_film_scene");
  bound = JSON.parse(String(init?.body));
  return Response.json(false); // The transaction found a stale generation: acknowledge, do not wake work.
};
function callback(
  token = filmCallbackToken(order, generation, 0),
  index = "0",
) {
  return new Request(
    `https://app.example/api/higgsfield/film-webhook?order=${order}&generation=${generation}&index=${index}&token=${token}`,
    {
      method: "POST",
      body: JSON.stringify({
        request_id: "request_one",
        status: "completed",
        video: { url: "http://127.0.0.1/private" },
      }),
    },
  );
}
test("film callbacks authenticate scene scope before database access and never trust callback media", async () => {
  assert.equal((await POST(callback("forged"))).status, 401);
  assert.equal(
    (await POST(callback(filmCallbackToken(order, generation, 1)))).status,
    401,
  );
  assert.equal(
    (await POST(callback(filmCallbackToken(order, generation, 23), "23")))
      .status,
    401,
  );
  assert.equal(requests.length, 0);
  assert.equal((await POST(callback())).status, 200);
  assert.deepEqual(bound, {
    p_order: order,
    p_generation: generation,
    p_index: 0,
    p_request: "request_one",
  });
  assert.ok(requests.includes("api.higgsfield.ai/requests/request_one/status"));
  assert.ok(requests.every((url) => !url.includes("127.0.0.1")));
  requests = [];
  bound = null;
  wrongRequest = true;
  assert.equal((await POST(callback())).status, 503);
  assert.equal(
    bound,
    null,
    "A different provider request cannot bind to this scene",
  );
});
