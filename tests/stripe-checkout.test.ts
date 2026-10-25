import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import Stripe from "stripe";
import { demoWorkspace } from "../src/lib/demo";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://billing-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.STRIPE_CHECKOUT_MODE = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
const owner = "11111111-1111-4111-8111-111111111111";
const propertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const demo = demoWorkspace();
const property = { ...demo.properties[0], id: propertyId, owner_id: owner };
let validUser = true,
  available = true,
  failSave = false;
let stripeCalls: URLSearchParams[] = [];
let keys: string[] = [];
let order: Record<string, unknown>;
let previousPaid = false;
let CHECKOUT: typeof import("../src/app/api/billing/checkout/route").POST;
let STATUS: typeof import("../src/app/api/billing/checkout/route").GET;
let WEBHOOK: typeof import("../src/app/api/stripe/webhook/route").POST;
before(async () => {
  ({ POST: CHECKOUT, GET: STATUS } =
    await import("../src/app/api/billing/checkout/route"));
  ({ POST: WEBHOOK } = await import("../src/app/api/stripe/webhook/route"));
});
beforeEach(() => {
  process.env.STRIPE_CHECKOUT_MODE = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  validUser = available = true;
  previousPaid = failSave = false;
  stripeCalls = [];
  keys = [];
  order = {
    id: orderId,
    owner_id: owner,
    property_id: propertyId,
    status: "pending",
    attempt: 1,
    checkout_session_id: null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
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
  const headers = new Headers(init?.headers);
  const method = init?.method || "GET";
  if (url.hostname === "api.stripe.com") {
    assert.equal(headers.get("authorization"), "Bearer sk_test_fake");
    if (method === "GET")
      return Response.json({
        id: "cs_test_one",
        livemode: false,
        status: previousPaid ? "complete" : "open",
        payment_status: previousPaid ? "paid" : "unpaid",
        url: "https://checkout.stripe.com/c/pay/cs_test_one",
      });
    stripeCalls.push(new URLSearchParams(String(init?.body)));
    keys.push(headers.get("idempotency-key")!);
    return Response.json({
      id: "cs_test_one",
      livemode: false,
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_one",
    });
  }
  assert.equal(url.hostname, "billing-tests.supabase.co");
  if (url.pathname === "/auth/v1/user")
    return validUser
      ? Response.json({
          id: owner,
          email: "agent@example.com",
          aud: "authenticated",
          role: "authenticated",
        })
      : Response.json({ message: "Invalid token" }, { status: 401 });
  if (url.pathname === "/rest/v1/properties") {
    assert.equal(
      method,
      "GET",
      "Billing must never publish or mutate a listing",
    );
    assert.equal(headers.get("authorization"), "Bearer user-token");
    assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
    return available
      ? Response.json(property)
      : Response.json({ code: "PGRST116" }, { status: 406 });
  }
  if (url.pathname === "/rest/v1/profiles") return Response.json(demo.profile);
  assert.equal(headers.get("authorization"), "Bearer test-service-key");
  if (url.pathname === "/rest/v1/rpc/reserve_stripe_test_order") {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      listing_id: propertyId,
      agent_id: owner,
    });
    return Response.json(order);
  }
  assert.equal(url.pathname, "/rest/v1/stripe_test_orders");
  if (method === "PATCH") {
    if (failSave)
      return Response.json({ message: "Unavailable" }, { status: 500 });
    const update = JSON.parse(String(init?.body));
    if (
      url.searchParams.get("status") === "eq.pending" &&
      order.status === "pending"
    )
      order = { ...order, ...update };
    return new Response(null, { status: 204 });
  }
  return Response.json(order);
};
after(() => {
  globalThis.fetch = realFetch;
});
const request = (body: unknown = { propertyId }, token = "user-token") =>
  new Request("https://app.example/api/billing/checkout", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
const payment = (overrides = {}) => ({
  id: "cs_test_one",
  object: "checkout.session",
  livemode: false,
  mode: "payment",
  amount_total: 9700,
  currency: "usd",
  payment_status: "paid",
  client_reference_id: orderId,
  metadata: {
    application: "mbp_test_checkout",
    order_id: orderId,
    property_id: propertyId,
    owner_id: owner,
  },
  ...overrides,
});
function webhook(
  session = payment(),
  options: { live?: boolean; badSignature?: boolean; stale?: boolean } = {},
) {
  const payload = JSON.stringify({
    id: "evt_test_one",
    object: "event",
    created: Math.floor(Date.now() / 1000),
    livemode: options.live || false,
    type: "checkout.session.completed",
    data: { object: session },
  });
  const stripe = new Stripe("sk_test_fake");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.badSignature ? "wrong" : "whsec_fake",
    ...(options.stale
      ? { timestamp: Math.floor(Date.now() / 1000) - 1000 }
      : {}),
  });
  return new Request("https://app.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

test("checkout authenticates ownership and rejects live keys without creating a session", async () => {
  assert.equal((await CHECKOUT(request({}, ""))).status, 401);
  validUser = false;
  assert.equal((await CHECKOUT(request())).status, 401);
  validUser = true;
  available = false;
  assert.equal((await CHECKOUT(request())).status, 404);
  available = true;
  process.env.STRIPE_SECRET_KEY = "sk_live_never_allowed";
  assert.equal((await CHECKOUT(request())).status, 503);
  assert.equal(stripeCalls.length, 0);
});
test("checkout fixes the USD price server-side and reuses a session across retries", async () => {
  const response = await CHECKOUT(
    request({ propertyId, amount: 1, currency: "eur", ownerId: "attacker" }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).url,
    "https://checkout.stripe.com/c/pay/cs_test_one",
  );
  const params = stripeCalls[0];
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "9700");
  assert.equal(params.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(params.get("mode"), "payment");
  assert.equal(params.get("adaptive_pricing[enabled]"), "false");
  assert.equal(params.get("metadata[owner_id]"), owner);
  assert.equal(
    params.get("success_url"),
    `https://www.mybeautifulproperty.com/dashboard/properties/${propertyId}?checkout=success`,
  );
  assert.equal(keys[0], `mbp-test-${orderId}-1`);
  assert.equal((await CHECKOUT(request())).status, 200);
  assert.equal(stripeCalls.length, 1);
});
test("a retry before local storage succeeds uses the same Stripe idempotency key", async () => {
  failSave = true;
  assert.equal((await CHECKOUT(request())).status, 503);
  failSave = false;
  assert.equal((await CHECKOUT(request())).status, 200);
  assert.deepEqual(keys, [`mbp-test-${orderId}-1`, `mbp-test-${orderId}-1`]);
});
test("paid and awaiting-webhook sessions do not offer another charge", async () => {
  order.checkout_session_id = "cs_test_one";
  previousPaid = true;
  assert.deepEqual(await (await CHECKOUT(request())).json(), {
    processing: true,
  });
  order.status = "paid";
  assert.deepEqual(await (await CHECKOUT(request())).json(), { paid: true });
  assert.equal(stripeCalls.length, 0);
});
test("webhooks reject invalid, stale and live signatures/events", async () => {
  assert.equal(
    (await WEBHOOK(webhook(payment(), { badSignature: true }))).status,
    400,
  );
  assert.equal(
    (await WEBHOOK(webhook(payment(), { stale: true }))).status,
    400,
  );
  assert.equal((await WEBHOOK(webhook(payment(), { live: true }))).status, 400);
  assert.equal(order.status, "pending");
});
test("webhooks verify amount, currency, owner and paid status before recording payment", async () => {
  assert.equal(
    (await WEBHOOK(webhook(payment({ amount_total: 1 })))).status,
    400,
  );
  assert.equal(
    (await WEBHOOK(webhook(payment({ currency: "eur" })))).status,
    400,
  );
  const mismatched = payment();
  mismatched.metadata.owner_id = propertyId;
  assert.equal((await WEBHOOK(webhook(mismatched))).status, 400);
  assert.equal(
    (await WEBHOOK(webhook(payment({ payment_status: "unpaid" })))).status,
    200,
  );
  assert.equal(order.status, "pending");
});
test("verified payment is idempotent and status reads persisted confirmation", async () => {
  assert.equal((await WEBHOOK(webhook())).status, 200);
  const paidAt = order.paid_at;
  assert.equal(order.status, "paid");
  assert.equal(order.stripe_session_id, "cs_test_one");
  assert.equal((await WEBHOOK(webhook())).status, 200);
  assert.equal(order.paid_at, paidAt);
  const status = await STATUS(
    new Request(
      `https://app.example/api/billing/checkout?propertyId=${propertyId}`,
      { headers: { authorization: "Bearer user-token" } },
    ),
  );
  assert.deepEqual(await status.json(), { enabled: true, paid: true });
});
test("failed database writes return retryable webhook failure", async () => {
  failSave = true;
  assert.equal((await WEBHOOK(webhook())).status, 503);
  assert.equal(order.status, "pending");
});
test("test receipts survive property deletion without recreating the property", async () => {
  order.property_id = null;
  assert.equal((await WEBHOOK(webhook())).status, 200);
  assert.equal(order.status, "paid");
  assert.equal(order.property_id, null);
});
