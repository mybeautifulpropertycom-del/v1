import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import { storyFixture } from "./story-fixture";

// Mock the two external services at their HTTP boundary; never send real photos,
// credentials, or paid requests in tests.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://story-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.OPENAI_API_KEY = "test-only-key";
let POST: typeof import("../src/app/api/property-story/route").POST;
before(async () => {
  ({ POST } = await import("../src/app/api/property-story/route"));
});
const realFetch = globalThis.fetch;
const owner = "11111111-1111-4111-8111-111111111111";
const property = {
  ...demoWorkspace().properties[0],
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner_id: owner,
  images: [
    `https://story-tests.supabase.co/storage/v1/object/public/property-images/${owner}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.webp`,
  ],
};
let validUser = true;
let available = true;
let quota = "reserved";
let providerCalls = 0;
let databaseCalls = 0;
let mutationCalls = 0;
let providerStatus = 200;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  if (url.hostname === "story-tests.supabase.co") {
    if (url.pathname === "/auth/v1/user")
      return validUser
        ? Response.json({
            id: owner,
            email: "agent@example.com",
            aud: "authenticated",
            role: "authenticated",
          })
        : Response.json({ message: "Invalid token" }, { status: 401 });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-user-token",
    );
    databaseCalls++;
    if (url.pathname.endsWith("/rpc/reserve_property_story"))
      return Response.json(quota);
    if (init?.method && init.method !== "GET") mutationCalls++;
    assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
    return available
      ? Response.json(property)
      : Response.json(
          { code: "PGRST116", message: "Not available" },
          { status: 406 },
        );
  }
  assert.equal(url.href, "https://api.openai.com/v1/responses");
  providerCalls++;
  if (providerStatus !== 200)
    return Response.json(
      { error: { code: "insufficient_quota", message: "private-test-key" } },
      { status: providerStatus },
    );
  const draft = storyFixture(property);
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(draft) }],
      },
    ],
  });
};
after(() => {
  globalThis.fetch = realFetch;
});
const request = (
  token = "test-user-token",
  body = JSON.stringify({ propertyId: property.id }),
) =>
  new Request("https://app.example/api/property-story", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

test("story route authenticates, rejects inaccessible listings, and never calls AI on failure", async () => {
  assert.equal((await POST(request(""))).status, 401);
  validUser = false;
  assert.equal((await POST(request())).status, 401);
  validUser = true;
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  process.env.OPENAI_API_KEY = "test-only-key";
  assert.equal(
    (await POST(request("test-user-token", "x".repeat(1025)))).status,
    413,
  );
  assert.equal((await POST(request("test-user-token", "{}"))).status, 400);
  assert.equal(databaseCalls, 0);
  available = false;
  assert.equal((await POST(request())).status, 404);
  available = true;
  quota = "daily_limit";
  assert.equal((await POST(request())).status, 429);
  quota = "cooldown";
  assert.equal((await POST(request())).status, 429);
  assert.equal(providerCalls, 0);
});

test("authorized generation returns a reviewable draft without saving or publishing", async () => {
  quota = "reserved";
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.draft.description, storyFixture(property).description);
  assert.equal(body.draft.content.captions.length, 1);
  assert.equal(typeof body.source, "string");
  assert.equal(providerCalls, 1);
  assert.equal(mutationCalls, 0);
});

test("the route preserves safe provider diagnostics instead of swallowing the real failure", async () => {
  providerStatus = 429;
  const originalWarn = console.warn;
  const logs: string[] = [];
  console.warn = (message) => {
    logs.push(String(message));
  };
  try {
    const response = await POST(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "AI_CREDITS");
    assert.match(body.reference, /^[a-f\d-]{36}$/);
    assert.ok(!JSON.stringify(body).includes("private-test-key"));
    assert.equal(JSON.parse(logs[0]).reference, body.reference);
    assert.ok(!logs.join("").includes("private-test-key"));
    assert.equal(mutationCalls, 0);
  } finally {
    console.warn = originalWarn;
    providerStatus = 200;
  }
});
