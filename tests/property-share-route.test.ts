import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import { propertyShareSource } from "../src/lib/property-sharing";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://share-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
process.env.OPENAI_API_KEY = "test-api-key";
const owner = "11111111-1111-4111-8111-111111111111";
const property = {
  ...demoWorkspace().properties[0],
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  owner_id: owner,
  status: "published" as "published" | "draft",
  address_slug: "vila-publicata",
};
let validUser = true,
  available = true,
  reservation = "reserved",
  providerStatus = 200,
  invalidOutput = false;
let providerCalls = 0,
  listingWrites = 0,
  reservations = 0;
let POST: typeof import("../src/app/api/property-share/route").POST;
before(async () => {
  ({ POST } = await import("../src/app/api/property-share/route"));
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  if (url.hostname === "share-tests.supabase.co") {
    if (url.pathname === "/auth/v1/user")
      return validUser
        ? Response.json({
            id: owner,
            aud: "authenticated",
            role: "authenticated",
          })
        : Response.json({ message: "Invalid token" }, { status: 401 });
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-user-token",
    );
    if (url.pathname.endsWith("/rpc/reserve_property_story")) {
      reservations++;
      return Response.json(reservation);
    }
    if (init?.method && init.method !== "GET") listingWrites++;
    assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
    assert.equal(url.searchParams.get("id"), `eq.${property.id}`);
    return available
      ? Response.json(property)
      : Response.json(
          { code: "PGRST116", message: "Unavailable" },
          { status: 406 },
        );
  }
  assert.equal(url.href, "https://api.openai.com/v1/responses");
  providerCalls++;
  const payload = JSON.parse(String(init?.body));
  assert.equal(payload.store, false);
  assert.equal(JSON.parse(payload.input).location, property.location);
  assert.ok(!JSON.stringify(payload).includes("spoofed-price"));
  if (providerStatus !== 200)
    return Response.json(
      { error: { message: "private-api-key", code: "insufficient_quota" } },
      { status: providerStatus },
    );
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              introduction: invalidOutput
                ? "https://untrusted.example/"
                : "O locuință cu spațiu pentru activitățile de zi cu zi. Descoperă în prezentare fotografiile și detaliile utile înainte de o vizionare.",
            }),
          },
        ],
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
  new Request("https://app.example/api/property-share", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

test("social drafts require ownership and publication before any paid request", async () => {
  assert.equal((await POST(request(""))).status, 401);
  validUser = false;
  assert.equal((await POST(request())).status, 401);
  validUser = true;
  assert.equal((await POST(request("test-user-token", "{}"))).status, 400);
  assert.equal(
    (await POST(request("test-user-token", "x".repeat(1025)))).status,
    413,
  );
  available = false;
  assert.equal((await POST(request())).status, 404);
  available = true;
  property.status = "draft";
  assert.equal((await POST(request())).status, 409);
  property.status = "published";
  assert.equal(providerCalls, 0);
  assert.equal(reservations, 0);
});

test("the draft uses saved facts and the canonical link without saving, publishing or contacting Facebook", async () => {
  const response = await POST(
    request(
      "test-user-token",
      JSON.stringify({ propertyId: property.id, location: "spoofed-price" }),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.source, propertyShareSource(property));
  assert.ok(body.text.includes(property.location));
  assert.ok(body.text.includes(property.currency));
  assert.match(body.text, /\/vila-publicata$/);
  assert.equal(providerCalls, 1);
  assert.equal(listingWrites, 0);
});

test("existing durable AI limits and unavailable configuration keep the fallback usable", async () => {
  reservation = "cooldown";
  assert.equal((await POST(request())).status, 429);
  reservation = "daily_limit";
  assert.equal((await POST(request())).status, 429);
  reservation = "reserved";
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status, 503);
  process.env.OPENAI_API_KEY = "test-api-key";
  assert.equal(providerCalls, 1);
});

test("provider errors and invalid output expose no provider secrets", async () => {
  const logs: string[] = [];
  const warn = console.warn;
  console.warn = (value) => logs.push(String(value));
  try {
    providerStatus = 429;
    const failed = await POST(request());
    assert.equal(failed.status, 502);
    assert.ok(!(await failed.text()).includes("private-api-key"));
    providerStatus = 200;
    invalidOutput = true;
    assert.equal((await POST(request())).status, 502);
    assert.ok(!logs.join("").includes("private-api-key"));
    assert.equal(listingWrites, 0);
  } finally {
    console.warn = warn;
  }
});
