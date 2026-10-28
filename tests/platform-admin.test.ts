import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://admin-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
process.env.STRIPE_SECRET_KEY = "sk_live_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
const actor = "11111111-1111-4111-8111-111111111111";
const agent = "22222222-2222-4222-8222-222222222222";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const demo = demoWorkspace();
let authorized = false,
  validIdentity = true,
  roleFailure = false,
  incomplete = false;
let serviceReads = 0,
  checkout: string | null = null,
  checkoutState = "open",
  publicationError = "";
let actions: string[] = [],
  payload: Record<string, unknown> | null = null;
let REBUILD: typeof import("../src/app/api/admin/rebuild-film/route").POST;
let RESUME: typeof import("../src/app/api/admin/resume-film/route").POST;
let PUBLISH: typeof import("../src/app/api/admin/publish/route").POST;
let ACCOUNTS: typeof import("../src/app/api/admin/accounts/route").GET;
let PROPERTIES: typeof import("../src/app/api/admin/properties/route").GET;
before(async () => {
  ({ POST: RESUME } = await import("../src/app/api/admin/resume-film/route"));
  ({ POST: REBUILD } = await import("../src/app/api/admin/rebuild-film/route"));
  ({ POST: PUBLISH } = await import("../src/app/api/admin/publish/route"));
  ({ GET: ACCOUNTS } = await import("../src/app/api/admin/accounts/route"));
  ({ GET: PROPERTIES } = await import("../src/app/api/admin/properties/route"));
});
beforeEach(() => {
  authorized = roleFailure = incomplete = false;
  validIdentity = true;
  serviceReads = 0;
  checkout = null;
  checkoutState = "open";
  publicationError = "";
  actions = [];
  payload = null;
  process.env.STRIPE_CHECKOUT_MODE = "live";
  delete process.env.HIGGSFIELD_ENABLED;
});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  const headers = new Headers(init?.headers);
  if (url.hostname === "api.stripe.com") {
    assert.equal(headers.get("authorization"), "Bearer sk_live_fake");
    assert.ok(checkout);
    if (url.pathname.endsWith("/expire")) {
      actions.push("expire");
      return Response.json({ id: checkout, status: "expired", livemode: true });
    }
    actions.push("retrieve");
    return Response.json({
      id: checkout,
      status: checkoutState,
      payment_status: "unpaid",
      livemode: true,
    });
  }
  assert.equal(url.hostname, "admin-tests.supabase.co");
  if (url.pathname === "/auth/v1/user") {
    assert.equal(headers.get("authorization"), "Bearer user-token");
    return validIdentity
      ? Response.json({
          id: actor,
          email: "admin@example.com",
          user_metadata: { role: "admin" },
        })
      : Response.json({ message: "Invalid JWT" }, { status: 401 });
  }
  if (url.pathname === "/rest/v1/rpc/is_platform_admin") {
    assert.equal(headers.get("authorization"), "Bearer user-token");
    return roleFailure
      ? Response.json({ message: "Role unavailable" }, { status: 500 })
      : Response.json(authorized);
  }
  assert.equal(headers.get("authorization"), "Bearer test-service-key");
  serviceReads++;
  if (url.pathname === "/rest/v1/platform_account_directory") {
    assert.equal(url.searchParams.get("offset"), "25");
    assert.equal(url.searchParams.get("limit"), "25");
    assert.ok(!url.searchParams.get("or")?.includes("evil,"));
    return Response.json(
      [{ id: agent, name: "Agent", login_email: "agent@example.com" }],
      { headers: { "content-range": "25-25/26" } },
    );
  }
  if (url.pathname === "/rest/v1/properties") {
    assert.equal(url.searchParams.get("id"), `eq.${id}`);
    return Response.json({
      ...demo.properties[0],
      id,
      owner_id: agent,
      ...(incomplete ? { images: [] } : {}),
    });
  }
  if (url.pathname === "/rest/v1/profiles") {
    assert.equal(
      url.searchParams.get("id"),
      `eq.${agent}`,
      "Use the property owner's contact profile",
    );
    return Response.json({ ...demo.profile, id: agent });
  }
  if (url.pathname === "/rest/v1/property_orders")
    return Response.json(
      checkout
        ? { id, status: "pending", checkout_session_id: checkout, attempt: 4 }
        : null,
    );
  if (
    url.pathname === "/rest/v1/property_video_jobs" ||
    url.pathname === "/rest/v1/property_admin_grants"
  )
    return Response.json(null);
  if (
    [
      "/rest/v1/rpc/admin_publish_property",
      "/rest/v1/rpc/admin_rebuild_property_film",
      "/rest/v1/rpc/admin_resume_byteplus_film",
    ].includes(url.pathname)
  ) {
    actions.push("publish");
    payload = JSON.parse(String(init?.body));
    if (publicationError)
      return Response.json(
        { code: publicationError, message: "Rejected" },
        { status: 400 },
      );
    return Response.json({
      published: true,
      paid: false,
      complimentary: true,
      publicPath: "/p/admin-home",
    });
  }
  throw Error(`Unexpected route: ${url.pathname}`);
};
const request = (
  body: Record<string, unknown> = { propertyId: id },
  token = true,
) =>
  new Request("https://app.example/api/admin/publish", {
    method: "POST",
    headers: token ? { authorization: "Bearer user-token" } : {},
    body: JSON.stringify(body),
  });
const get = (path: string) =>
  new Request(`https://app.example/api/admin/${path}`, {
    headers: { authorization: "Bearer user-token" },
  });

test("admin routes reject unauthenticated, forged metadata, revoked and unavailable roles before service access", async () => {
  assert.equal((await PUBLISH(request({}, false))).status, 401);
  validIdentity = false;
  assert.equal((await PUBLISH(request())).status, 401);
  validIdentity = true;
  assert.equal(
    (await PUBLISH(request({ propertyId: id, actor_id: actor, isAdmin: true })))
      .status,
    403,
  );
  assert.equal((await ACCOUNTS(get("accounts"))).status, 403);
  assert.equal((await PROPERTIES(get(`properties?id=${id}`))).status, 403);
  authorized = true;
  roleFailure = true;
  assert.equal((await PUBLISH(request())).status, 403);
  assert.equal(serviceReads, 0);
});
test("verified admin can review another agent's account and private property", async () => {
  authorized = true;
  const accounts = await ACCOUNTS(get("accounts?page=1&search=evil,%28%29"));
  assert.equal(accounts.status, 200);
  assert.equal((await accounts.json()).total, 26);
  const property = await PROPERTIES(get(`properties?id=${id}`));
  assert.equal(property.status, 200);
  assert.equal(property.headers.get("cache-control"), "no-store");
  assert.equal((await property.json()).property.owner_id, agent);
});
test("complimentary publication uses verified actor, validates property, and requires no Stripe setup for a fresh draft", async () => {
  authorized = true;
  process.env.STRIPE_CHECKOUT_MODE = "off";
  incomplete = true;
  assert.equal((await PUBLISH(request())).status, 400);
  assert.equal(payload, null);
  incomplete = false;
  const response = await PUBLISH(
    request({
      propertyId: id,
      actor_id: agent,
      reason: "Complimentary showcase",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).paid, false);
  assert.deepEqual(payload, {
    listing_id: id,
    actor_id: actor,
    grant_reason: "Complimentary showcase",
    expected_session: null,
    expected_attempt: null,
  });
  assert.deepEqual(actions, ["publish"]);
});
test("complimentary publication expires an open payment form before the database grant", async () => {
  authorized = true;
  checkout = "cs_live_existing";
  assert.equal((await PUBLISH(request())).status, 200);
  assert.deepEqual(actions, ["retrieve", "expire", "publish"]);
  assert.equal(payload?.expected_session, checkout);
  assert.equal(payload?.expected_attempt, 4);
});
test("in-flight payments and concurrent checkout or role changes do not receive a success response", async () => {
  authorized = true;
  checkout = "cs_live_existing";
  checkoutState = "complete";
  assert.equal((await PUBLISH(request())).status, 409);
  assert.equal(payload, null);
  checkout = null;
  publicationError = "P0409";
  assert.equal((await PUBLISH(request())).status, 409);
  publicationError = "42501";
  assert.equal((await PUBLISH(request())).status, 403);
});

test("film rebuild verifies admin identity, enabled photo mode and transactional conflict responses", async () => {
  process.env.PROPERTY_VIDEO_MODE = "photo-montage";
  assert.equal((await REBUILD(request({}, false))).status, 401);
  assert.equal((await REBUILD(request())).status, 403);
  authorized = true;
  assert.equal(
    (await REBUILD(request())).status,
    409,
    "Disabled worker never silently queues a rebuild",
  );
  process.env.HIGGSFIELD_ENABLED = "true";
  publicationError = "P0409";
  assert.equal(
    (await REBUILD(request({ propertyId: id, actor_id: agent }))).status,
    409,
  );
  assert.deepEqual(payload, {
    listing_id: id,
    actor_id: actor,
    target_engine: "photo-montage-v1",
  });
  publicationError = "42501";
  assert.equal(
    (await REBUILD(request())).status,
    403,
    "Database rechecks revoked administrator rights",
  );
  delete process.env.HIGGSFIELD_ENABLED;
});

test("BytePlus resume verifies admin identity and never accepts a forged actor", async () => {
  assert.equal((await RESUME(request({}, false))).status, 401);
  assert.equal((await RESUME(request())).status, 403);
  authorized = true;
  process.env.PROPERTY_VIDEO_MODE = "byteplus-montage";
  process.env.PROPERTY_VIDEO_ENABLED = "false";
  assert.equal((await RESUME(request())).status, 409);
  assert.equal(payload, null);
  process.env.PROPERTY_VIDEO_ENABLED = "true";
  process.env.ARK_API_KEY = "test-key";
  publicationError = "P0409";
  assert.equal(
    (await RESUME(request({ propertyId: id, actor_id: agent }))).status,
    409,
  );
  assert.deepEqual(payload, { listing_id: id, actor_id: actor });
  delete process.env.PROPERTY_VIDEO_ENABLED;
  delete process.env.ARK_API_KEY;
});
