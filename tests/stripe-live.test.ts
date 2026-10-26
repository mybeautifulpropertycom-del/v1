import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import Stripe from "stripe";
import { demoWorkspace } from "../src/lib/demo";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://live-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake_live";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const demo = demoWorkspace();
let order: Record<string, unknown>,
  active = false,
  allowed = false,
  available = true,
  activationCalls = 0,
  failSave = false,
  fenceCheckout = false,
  expiredSessions = 0,
  disputed = false,
  refunded = 0,
  disputeStatus = "needs_response";
let stripePosts: URLSearchParams[] = [],
  applications: Record<string, unknown>[] = [];
let POST: typeof import("../src/app/api/billing/checkout/route").POST;
let GET: typeof import("../src/app/api/billing/checkout/route").GET;
let WEBHOOK: typeof import("../src/app/api/stripe/webhook/route").POST;
before(async () => {
  ({ POST, GET } = await import("../src/app/api/billing/checkout/route"));
  ({ POST: WEBHOOK } = await import("../src/app/api/stripe/webhook/route"));
});
beforeEach(() => {
  delete process.env.HIGGSFIELD_ENABLED;
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_fake";
  process.env.STRIPE_CHECKOUT_MODE = "live";
  process.env.STRIPE_SECRET_KEY = "sk_live_fake";
  process.env.STRIPE_LIVE_PAYMENTS_ENABLED = "true";
  order = {
    id: orderId,
    property_id: id,
    owner_id: owner,
    status: "pending",
    attempt: 1,
    checkout_session_id: null,
    last_event_created: 0,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  active = allowed = failSave = disputed = fenceCheckout = false;
  expiredSessions = 0;
  available = true;
  activationCalls = refunded = 0;
  disputeStatus = "needs_response";
  stripePosts = [];
  applications = [];
});
const metadata = {
  application: "mbp_property_purchase",
  order_id: orderId,
  property_id: id,
  owner_id: owner,
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  const method = init?.method || "GET",
    headers = new Headers(init?.headers);
  if (url.hostname === "api.stripe.com") {
    assert.equal(headers.get("authorization"), "Bearer sk_live_fake");
    if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
      stripePosts.push(new URLSearchParams(String(init?.body)));
      assert.ok(
        [`mbp-live-${orderId}-1`, `mbp-embedded-live-${orderId}-1`].includes(
          headers.get("idempotency-key")!,
        ),
      );
      return Response.json({
        id: "cs_live_one",
        client_secret: "cs_live_one_secret_fake",
        livemode: true,
        status: "open",
        url: "https://checkout.stripe.com/c/pay/cs_live_one",
      });
    }
    if (url.pathname === "/v1/checkout/sessions/cs_live_one/expire") {
      expiredSessions++;
      return Response.json({
        id: "cs_live_one",
        status: "expired",
        livemode: true,
      });
    }
    if (url.pathname === "/v1/payment_intents/pi_live_one")
      return Response.json({
        id: "pi_live_one",
        livemode: true,
        status: "succeeded",
        currency: "usd",
        amount: 9700,
        metadata,
        latest_charge: "ch_live_one",
      });
    if (url.pathname === "/v1/charges/ch_live_one")
      return Response.json({
        id: "ch_live_one",
        livemode: true,
        paid: true,
        amount: 9700,
        currency: "usd",
        payment_intent: "pi_live_one",
        amount_refunded: refunded,
        disputed,
      });
    if (url.pathname === "/v1/disputes")
      return Response.json({
        data: [{ id: "dp_live_one", status: disputeStatus }],
        has_more: false,
      });
    if (url.pathname === "/v1/checkout/sessions/cs_live_one")
      return Response.json({
        id: "cs_live_one",
        livemode: true,
        status: "open",
        url: "https://checkout.stripe.com/c/pay/cs_live_one",
      });
    throw Error(`Unexpected Stripe route ${url.pathname}`);
  }
  assert.equal(url.hostname, "live-tests.supabase.co");
  if (url.pathname === "/auth/v1/user")
    return Response.json({
      id: owner,
      email: "agent@example.com",
      role: "authenticated",
      aud: "authenticated",
    });
  if (url.pathname === "/rest/v1/properties") {
    assert.equal(
      method,
      "GET",
      "Only the atomic SQL function may change publication after refund",
    );
    assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
    return available
      ? Response.json({ ...demo.properties[0], id, owner_id: owner })
      : Response.json({ code: "PGRST116" }, { status: 406 });
  }
  if (url.pathname === "/rest/v1/profiles") return Response.json(demo.profile);
  assert.equal(headers.get("authorization"), "Bearer test-service-key");
  if (url.pathname.endsWith("/rpc/activate_property_billing")) {
    active = true;
    activationCalls++;
    return Response.json(true);
  }
  if (url.pathname.endsWith("/rpc/property_has_live_access"))
    return Response.json(allowed);
  if (url.pathname.endsWith("/property_billing_settings"))
    return Response.json({ enabled: active });
  if (url.pathname.endsWith("/rpc/request_property_publication"))
    return Response.json(allowed ? { published: true, paid: true } : { order });
  if (url.pathname.endsWith("/rpc/reserve_property_order"))
    return Response.json(order);
  if (url.pathname.endsWith("/rpc/apply_property_payment")) {
    if (failSave) return Response.json({ message: "failed" }, { status: 500 });
    const update = JSON.parse(String(init?.body));
    applications.push(update);
    order.status = update.new_status;
    allowed = update.new_status === "paid";
    return Response.json(update.new_status);
  }
  if (url.pathname === "/rest/v1/property_video_jobs") {
    const enabled = process.env.HIGGSFIELD_ENABLED === "true";
    assert.equal(
      url.searchParams.get("select")?.includes("provider_phase"),
      enabled,
      "The existing checkout must work before the optional video migration is applied",
    );
    return Response.json({
      status: "processing",
      attempts: 1,
      updated_at: new Date().toISOString(),
      ...(enabled ? { provider_phase: "uncertain" } : {}),
    });
  }
  assert.equal(url.pathname, "/rest/v1/property_orders");
  if (method === "PATCH") {
    if (fenceCheckout) return Response.json([]);
    order = { ...order, ...JSON.parse(String(init?.body)) };
    return Response.json([order]);
  }
  return Response.json(order);
};
after(() => {
  globalThis.fetch = realFetch;
});
const req = () =>
  new Request("https://app.example/api/billing/checkout", {
    method: "POST",
    headers: { authorization: "Bearer user-token" },
    body: JSON.stringify({ propertyId: id, amount: 1 }),
  });
const statusReq = () =>
  new Request(`https://app.example/api/billing/checkout?propertyId=${id}`, {
    headers: { authorization: "Bearer user-token" },
  });
const session = (overrides = {}) => ({
  id: "cs_live_one",
  livemode: true,
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_live_one",
  currency: "usd",
  amount_total: 9700,
  client_reference_id: orderId,
  metadata,
  ...overrides,
});
function webhook(
  type = "checkout.session.completed",
  object = session(),
  live = true,
) {
  const payload = JSON.stringify({
    id: "evt_live_one",
    livemode: live,
    type,
    created: 1000,
    data: { object },
  });
  const signature = new Stripe(
    "sk_live_fake",
  ).webhooks.generateTestHeaderString({ payload, secret: "whsec_fake_live" });
  return new Request("https://app.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}
test("live keys can be configured now without enabling charges or the publication gate", async () => {
  process.env.STRIPE_LIVE_PAYMENTS_ENABLED = "false";
  assert.equal((await POST(req())).status, 503);
  const status = await (await GET(statusReq())).json();
  assert.equal(status.mode, "live");
  assert.equal(status.canPurchase, false);
  assert.equal(status.requiresPayment, false);
  assert.equal(activationCalls, 0);
  assert.equal(stripePosts.length, 0);
});
test("live checkout verifies ownership, charges exactly $97 USD, and resumes the same session", async () => {
  available = false;
  assert.equal((await POST(req())).status, 404);
  available = true;
  const result = await POST(req());
  assert.equal(result.status, 200);
  assert.equal(
    (await result.json()).url,
    "https://checkout.stripe.com/c/pay/cs_live_one",
  );
  const params = stripePosts[0];
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "9700");
  assert.equal(params.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(params.get("payment_intent_data[metadata][order_id]"), orderId);
  assert.equal(params.get("mode"), "payment");
  assert.equal((await POST(req())).status, 200);
  assert.equal(stripePosts.length, 1);
});
test("live launch checks persisted access, and paid or legacy properties are not charged again", async () => {
  const state = await (await GET(statusReq())).json();
  assert.equal(state.requiresPayment, true);
  assert.equal(state.allowed, false);
  allowed = true;
  const included = await (await POST(req())).json();
  assert.equal(included.allowed, true);
  assert.equal(
    included.paid,
    false,
    "An included publication is not a paid Stripe receipt",
  );
  assert.equal(stripePosts.length, 0);
});
test("mismatched test keys and test payment events cannot unlock live purchases", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_wrong";
  assert.equal((await POST(req())).status, 503);
  process.env.STRIPE_SECRET_KEY = "sk_live_fake";
  assert.equal(
    (await WEBHOOK(webhook("checkout.session.completed", session(), false)))
      .status,
    400,
  );
  assert.equal(
    (
      await WEBHOOK(
        webhook("checkout.session.completed", session({ amount_total: 1 })),
      )
    ).status,
    400,
  );
  assert.equal(applications.length, 0);
});
test("verified live payment records entitlement through the atomic database function", async () => {
  assert.equal((await WEBHOOK(webhook())).status, 200);
  assert.deepEqual(applications[0], {
    order_id: orderId,
    intent_id: "pi_live_one",
    new_status: "paid",
    event_created: 1000,
  });
});
test("refund before checkout completion is resolved from current Stripe state, not the stale event", async () => {
  refunded = 9700;
  assert.equal((await WEBHOOK(webhook())).status, 200);
  assert.equal(applications[0].new_status, "refunded");
  refunded = 3000;
  applications = [];
  assert.equal(
    (
      await WEBHOOK(
        webhook("charge.refunded", { payment_intent: "pi_live_one" } as never),
      )
    ).status,
    200,
  );
  assert.equal(applications[0].new_status, "paid");
});
test("disputes revoke access and a won dispute restores purchase rights without publishing", async () => {
  disputed = true;
  assert.equal(
    (
      await WEBHOOK(
        webhook("charge.dispute.created", {
          payment_intent: "pi_live_one",
        } as never),
      )
    ).status,
    200,
  );
  assert.equal(applications[0].new_status, "disputed");
  disputeStatus = "won";
  assert.equal(
    (
      await WEBHOOK(
        webhook("charge.dispute.closed", {
          payment_intent: "pi_live_one",
        } as never),
      )
    ).status,
    200,
  );
  assert.equal(applications[1].new_status, "paid");
});
test("webhooks keep processing when sales are paused and failed saves are retryable", async () => {
  process.env.STRIPE_LIVE_PAYMENTS_ENABLED = "false";
  failSave = true;
  assert.equal((await WEBHOOK(webhook())).status, 503);
  failSave = false;
  assert.equal((await WEBHOOK(webhook())).status, 200);
  assert.equal(applications.length, 1);
});

test("embedded payment uses a fixed-price Stripe iframe session with no external redirect", async () => {
  const response = await POST(
    new Request("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({ propertyId: id, embedded: true }),
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.clientSecret, "cs_live_one_secret_fake");
  assert.equal(body.publishableKey, "pk_live_fake");
  assert.equal(body.url, undefined);
  const params = stripePosts[0];
  assert.equal(params.get("ui_mode"), "embedded_page");
  assert.equal(params.get("redirect_on_completion"), "never");
  assert.equal(params.get("success_url"), null);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "9700");
});
test("paid publication skips checkout and a missing public key cannot create an embedded charge", async () => {
  const embedded = () =>
    new Request("https://app.example/api/billing/checkout", {
      method: "POST",
      headers: { authorization: "Bearer user-token" },
      body: JSON.stringify({ propertyId: id, embedded: true }),
    });
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  assert.equal((await POST(embedded())).status, 503);
  assert.equal(stripePosts.length, 0);
  allowed = true;
  assert.deepEqual(await (await POST(embedded())).json(), {
    published: true,
    paid: true,
  });
  assert.equal(stripePosts.length, 0);
});

test("publication status keeps working before optional Higgsfield activation and exposes recovery state after activation", async () => {
  const status = () =>
    GET(
      new Request(
        `https://app.example/api/billing/checkout?propertyId=${id}&workflow=publish`,
        {
          headers: { authorization: "Bearer user-token" },
        },
      ),
    );
  const before = await status();
  assert.equal(before.status, 200);
  assert.equal((await before.json()).videoNeedsReview, false);
  process.env.HIGGSFIELD_ENABLED = "true";
  const enabled = await status();
  assert.equal(enabled.status, 200);
  assert.equal((await enabled.json()).videoNeedsReview, true);
});

for (const embedded of [false, true]) {
  test(`a complimentary publication fences an in-flight ${embedded ? "embedded" : "hosted"} checkout`, async () => {
    fenceCheckout = true;
    const request = embedded
      ? new Request("https://app.example/api/billing/checkout", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({ propertyId: id, embedded: true }),
        })
      : req();
    const result = await POST(request);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { processing: true });
    assert.equal(expiredSessions, 1);
  });
}
