import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import Stripe from "stripe";
import { demoWorkspace } from "../src/lib/demo";
import {
  promotionPackages,
  promotionKeywords,
  promotionTargetArea,
  defaultPromotionTargetArea,
} from "../src/lib/promotion-packages";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://promotion-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://urmatoarea-proprietate.ro";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_promotion_test";
const owner = "11111111-1111-4111-8111-111111111111",
  propertyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let POST: typeof import("../src/app/api/promotions/route").POST,
  WEBHOOK: typeof import("../src/app/api/stripe/webhook/route").POST,
  ADMIN: typeof import("../src/app/api/admin/promotions/route").POST;
before(async () => {
  ({ POST } = await import("../src/app/api/promotions/route"));
  ({ POST: WEBHOOK } = await import("../src/app/api/stripe/webhook/route"));
  ({ POST: ADMIN } = await import("../src/app/api/admin/promotions/route"));
});
let order: Record<string, any>,
  session: Record<string, any>,
  authorized: boolean,
  available: boolean,
  isAdmin: boolean,
  refunded: number;
let legacySession: Record<string, any> | null;
let customerPosts: URLSearchParams[];
let saveRace: "same_session" | "cancelled" | null;
let stripePosts: URLSearchParams[],
  applied: Record<string, unknown>[],
  writes: string[],
  reserve: Record<string, unknown>[];
const metadata = {
  application: "up_google_search_promotion",
  order_id: orderId,
  property_id: propertyId,
  owner_id: owner,
  promotion_package: "start",
};
beforeEach(() => {
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_fake";
  process.env.STRIPE_CHECKOUT_MODE = "live";
  process.env.STRIPE_SECRET_KEY = "sk_live_fake";
  process.env.STRIPE_LIVE_PAYMENTS_ENABLED = "true";
  order = {
    id: orderId,
    owner_id: owner,
    property_id: propertyId,
    package: "start",
    amount: 30000,
    currency: "ron",
    livemode: true,
    payment_status: "pending",
    last_event_created: 0,
    target_area: "Brașov",
    notes: "",
    snapshot: { title: "Vila cu grădină", email: "agent@example.com" },
    checkout_session_id: null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  session = {
    id: "cs_promotion",
    status: "open",
    livemode: true,
    payment_status: "unpaid",
    url: "https://checkout.stripe.com/c/pay/cs_promotion",
    mode: "payment",
    ui_mode: "elements",
    customer: "cus_promotion",
    client_secret: "cs_promotion_secret_fake",
    amount_total: 30000,
    currency: "ron",
    metadata,
    client_reference_id: orderId,
    payment_intent: "pi_promotion",
  };
  authorized = available = true;
  isAdmin = false;
  refunded = 0;
  legacySession = null;
  customerPosts = [];
  saveRace = null;
  stripePosts = [];
  applied = [];
  writes = [];
  reserve = [];
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    ),
    method = init?.method || "GET";
  if (url.hostname === "promotion-tests.supabase.co") {
    if (url.pathname === "/auth/v1/user")
      return authorized
        ? Response.json({
            id: owner,
            email: "agent@example.com",
            aud: "authenticated",
            role: "authenticated",
          })
        : Response.json({ message: "Invalid" }, { status: 401 });
    if (url.pathname.endsWith("/rpc/is_platform_admin"))
      return Response.json(isAdmin);
    if (url.pathname.endsWith("/rpc/reserve_promotion_order")) {
      reserve.push(JSON.parse(String(init?.body)));
      return Response.json(order);
    }
    if (url.pathname.endsWith("/rpc/apply_promotion_payment")) {
      applied.push(JSON.parse(String(init?.body)));
      return Response.json(null);
    }
    if (url.pathname.endsWith("/rpc/update_promotion_campaign")) {
      writes.push("campaign-update");
      return Response.json(order);
    }
    if (url.pathname.endsWith("/rpc/request_promotion_stop")) {
      writes.push("request-stop");
      return Response.json(null);
    }
    if (url.pathname.endsWith("/properties")) {
      assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
      return available
        ? Response.json({
            ...demoWorkspace().properties[0],
            id: propertyId,
            owner_id: owner,
            status: "published",
          })
        : Response.json({ code: "PGRST116" }, { status: 406 });
    }
    if (url.pathname.endsWith("/profiles"))
      return Response.json({ ...demoWorkspace().profile, id: owner });
    if (url.pathname.endsWith("/promotion_orders")) {
      if (method === "PATCH") {
        const update = JSON.parse(String(init?.body));
        if (update.checkout_session_id && saveRace) {
          if (saveRace === "same_session")
            order.checkout_session_id = update.checkout_session_id;
          else order.payment_status = "cancelled";
          saveRace = null;
          return Response.json(null);
        }
        Object.assign(order, update);
        return Response.json(
          url.searchParams.get("select") === "id" ? { id: orderId } : null,
        );
      }
      if (url.searchParams.get("owner_id"))
        assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
      return Response.json(order);
    }
    writes.push(url.pathname);
    throw new Error("Unexpected database call");
  }
  assert.equal(url.hostname, "api.stripe.com");
  if (url.pathname.startsWith("/v1/customers") && method === "POST") {
    customerPosts.push(new URLSearchParams(String(init?.body)));
    return Response.json({ id: "cus_promotion" });
  }
  if (url.pathname === "/v1/checkout/sessions/cs_legacy")
    return Response.json(legacySession);
  if (url.pathname === "/v1/checkout/sessions/cs_legacy/expire") {
    legacySession!.status = "expired";
    return Response.json(legacySession);
  }
  if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
    stripePosts.push(new URLSearchParams(String(init?.body)));
    assert.equal(
      new Headers(init?.headers).get("idempotency-key"),
      `up-promotion-card-${order.livemode ? "live" : "test"}-${orderId}`,
    );
    return Response.json(session);
  }
  if (url.pathname === "/v1/checkout/sessions/cs_promotion")
    return Response.json(session);
  if (url.pathname === "/v1/checkout/sessions/cs_promotion/expire") {
    session.status = "expired";
    return Response.json(session);
  }
  if (url.pathname === "/v1/payment_intents/pi_promotion")
    return Response.json({
      id: "pi_promotion",
      metadata,
      livemode: order.livemode,
      amount: session.amount_total,
      currency: "ron",
      status: "succeeded",
      latest_charge: "ch_promotion",
    });
  if (url.pathname === "/v1/charges/ch_promotion")
    return Response.json({
      id: "ch_promotion",
      livemode: order.livemode,
      paid: true,
      disputed: false,
      amount: session.amount_total,
      amount_refunded: refunded,
      currency: "ron",
      payment_intent: "pi_promotion",
    });
  throw new Error(`Unexpected Stripe call ${url.pathname}`);
};
after(() => {
  globalThis.fetch = realFetch;
});
const request = (
  body: unknown = {
    propertyId,
    package: "start",
    targetArea: "Brașov",
    notes: "",
  },
  token = true,
) =>
  new Request("https://app.example/api/promotions", {
    method: "POST",
    headers: token ? { Authorization: "Bearer user-test-token" } : {},
    body: JSON.stringify(body),
  });
function event(type: string, object: unknown, live = true) {
  const body = JSON.stringify({
    id: "evt_promotion",
    type,
    created: 200,
    livemode: live,
    data: { object },
  });
  return new Request("https://app.example/api/stripe/webhook", {
    method: "POST",
    headers: {
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({
        payload: body,
        secret: process.env.STRIPE_WEBHOOK_SECRET!,
      }),
    },
    body,
  });
}

test("all promotion packages are exact RON budgets and keyword examples respect the property transaction", () => {
  assert.deepEqual(
    Object.values(promotionPackages).map((p) => p.amount),
    [30000, 50000, 100000],
  );
  assert.match(
    promotionKeywords({ type: "House", transaction: "rent" }, "Brașov")[0],
    /casă de închiriat Brașov/,
  );
});
test("promotion defaults and keywords remove postal codes while preserving town and sector numbers", () => {
  for (const location of [
    "Strada Test 9, Brașov 500001",
    "Strada Test 9, 500001 Brașov",
    "Strada Test 9, Brașov, RO-500001, România",
  ]) {
    assert.equal(defaultPromotionTargetArea(location), "Brașov");
  }
  assert.equal(
    defaultPromotionTargetArea("Strada Test, 1 Decembrie 077005, Romania"),
    "1 Decembrie",
  );
  assert.equal(
    promotionTargetArea("București 010101, Sector 1"),
    "București, Sector 1",
  );
  assert.deepEqual(
    promotionKeywords({ type: "House", transaction: "rent" }, "Brașov 500001"),
    ["casă de închiriat Brașov", "închiriere casă Brașov"],
  );
});
test("the promotion default keeps both city and district without guessing a different municipality", () => {
  assert.equal(
    defaultPromotionTargetArea(
      "Strada Test 9, București, Pantelimon 021621, România",
    ),
    "București, Pantelimon",
  );
  assert.equal(
    defaultPromotionTargetArea(
      "Șoseaua Test 9, Pantelimon, Bucuresti, România",
    ),
    "București, Pantelimon",
  );
  assert.equal(
    defaultPromotionTargetArea(
      "Strada Test 9, Drumul Taberei, București, România",
    ),
    "București, Drumul Taberei",
  );
  assert.equal(
    defaultPromotionTargetArea("Strada Test 9, Cluj-Napoca, Mărăști, România"),
    "Cluj-Napoca, Mărăști",
  );
  assert.equal(
    defaultPromotionTargetArea(
      "Strada Test 9, Pantelimon 077145, Ilfov, România",
    ),
    "Pantelimon, Ilfov",
  );
  assert.equal(defaultPromotionTargetArea("Pantelimon"), "Pantelimon");
  assert.equal(
    defaultPromotionTargetArea("Strada Test 9, București, Bucuresti, România"),
    "București",
  );
});

test("the saved campaign area and keyword examples exclude postal codes even in direct API requests", async () => {
  const response = await POST(
    request({
      propertyId,
      package: "start",
      targetArea: "Brașov 500001",
      notes: "",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(reserve[0].area, "Brașov");
  assert.deepEqual((reserve[0].listing_snapshot as any).keywords, [
    "casă de vânzare Brașov",
    "vânzare casă Brașov",
  ]);
});
test("a postal code alone cannot be used as a promotion area", async () => {
  const response = await POST(
    request({ propertyId, package: "start", targetArea: "500001", notes: "" }),
  );
  assert.equal(response.status, 400);
  assert.equal(reserve.length, 0);
  assert.equal(stripePosts.length, 0);
});

test("promotion checkout authenticates and requires an owned published listing", async () => {
  assert.equal((await POST(request({}, false))).status, 401);
  authorized = false;
  assert.equal((await POST(request())).status, 401);
  authorized = true;
  assert.equal(
    (
      await POST(
        request({
          propertyId,
          package: "free",
          targetArea: "Brașov",
          notes: "",
        }),
      )
    ).status,
    400,
  );
  available = false;
  assert.equal((await POST(request())).status, 404);
  assert.equal(stripePosts.length, 0);
});
test("Stripe amount comes from the server package, returns to promotion, and repeats reuse the same session", async () => {
  const response = await POST(
    request({
      propertyId,
      package: "start",
      targetArea: "Brașov",
      notes: "",
      amount: 1,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    stripePosts[0].get("line_items[0][price_data][unit_amount]"),
    "30000",
  );
  assert.equal(
    stripePosts[0].get("line_items[0][price_data][currency]"),
    "ron",
  );
  assert.match(
    stripePosts[0].get("return_url")!,
    /\/panou\/promovare\?payment=success/,
  );
  assert.equal(
    stripePosts[0].get("payment_intent_data[metadata][application]"),
    metadata.application,
  );
  assert.equal(reserve[0].agent_id, owner);
  assert.equal((reserve[0].listing_snapshot as any).email, "agent@example.com");
  assert.equal((await POST(request())).status, 200);
  assert.equal(stripePosts.length, 1);
  assert.deepEqual(writes, []);
});
test("card checkout uses account contact details and disables Link and saved cards", async () => {
  const result = await POST(
    request({
      propertyId,
      package: "start",
      targetArea: "Brașov",
      notes: "",
      name: "Forged",
      email: "forged@example.com",
    }),
  );
  const body = await result.json();
  assert.equal(body.clientSecret, session.client_secret);
  assert.equal(body.orderId, orderId);
  assert.equal(body.billingDetails.name, demoWorkspace().profile.name);
  assert.equal(body.billingDetails.email, "agent@example.com");
  assert.equal(body.billingDetails.phone, demoWorkspace().profile.phone);
  assert.equal(customerPosts[0].get("name"), body.billingDetails.name);
  assert.equal(customerPosts[0].get("email"), body.billingDetails.email);
  assert.equal(stripePosts[0].get("customer"), "cus_promotion");
  assert.equal(stripePosts[0].get("ui_mode"), "elements");
  assert.equal(stripePosts[0].get("wallet_options[link][display]"), "never");
  assert.equal(
    stripePosts[0].get("saved_payment_method_options[payment_method_save]"),
    "disabled",
  );
  assert.equal(stripePosts[0].has("success_url"), false);
  assert.equal(stripePosts[0].has("customer_email"), false);
  assert.equal(stripePosts[0].get("allowed_payment_method_types[0]"), "card");
  assert.equal(
    (await POST(request({ action: "resume", orderId }))).status,
    200,
  );
  assert.equal(stripePosts.length, 1);
  assert.equal(customerPosts.length, 2); // Saved contact refreshed on resume.
});
test("legacy hosted sessions expire before their one idempotent card replacement", async () => {
  legacySession = {
    ...session,
    id: "cs_legacy",
    ui_mode: "hosted_page",
    client_secret: null,
    customer: null,
  };
  order.checkout_session_id = "cs_legacy";
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(legacySession.status, "expired");
  assert.equal(order.checkout_session_id, "cs_promotion");
  assert.equal((await POST(request())).status, 200);
  assert.equal(stripePosts.length, 1);
});
test("expired card sessions cannot create a second payment for the same order", async () => {
  order.checkout_session_id = session.id;
  session.status = "expired";
  assert.equal(
    (await POST(request({ action: "resume", orderId }))).status,
    409,
  );
  assert.equal(order.payment_status, "cancelled");
  assert.equal(stripePosts.length, 0);
});
test("concurrent identical session saves never expire the other request's payable session", async () => {
  saveRace = "same_session";
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).clientSecret, session.client_secret);
  assert.equal(session.status, "open");
  assert.equal(stripePosts.length, 1);
});
test("a cancellation that wins an in-flight checkout expires the new Stripe session", async () => {
  saveRace = "cancelled";
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processing: true, orderId });
  assert.equal(session.status, "expired");
  assert.equal(order.payment_status, "cancelled");
});
test("completed unpaid sessions wait for confirmation without creating another checkout", async () => {
  order.checkout_session_id = session.id;
  session.status = "complete";
  const response = await POST(request({ action: "resume", orderId }));
  assert.deepEqual(await response.json(), { processing: true, orderId });
  assert.equal(stripePosts.length, 0);
  assert.equal(applied.length, 0);
});

test("missing or mismatched publishable keys cannot create a payment", async () => {
  for (const value of ["", "pk_test_wrong"]) {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = value;
    assert.equal((await POST(request())).status, 503);
  }
  assert.equal(stripePosts.length, 0);
  assert.equal(customerPosts.length, 0);
});

test("an existing pending budget cannot be silently changed and a paid session never offers a new charge", async () => {
  assert.equal(
    (
      await POST(
        request({
          propertyId,
          package: "plus",
          targetArea: "Brașov",
          notes: "",
        }),
      )
    ).status,
    409,
  );
  order.checkout_session_id = "cs_promotion";
  session.payment_status = "paid";
  session.status = "complete";
  const response = await POST(request());
  assert.deepEqual(await response.json(), { processing: true, orderId });
  assert.equal(stripePosts.length, 0);
  assert.equal(applied.length, 1);
});

for (const offer of [promotionPackages.plus, promotionPackages.extended]) {
  test(`the ${offer.price} RON promotion sends its exact amount and package to Stripe`, async () => {
    order.package = offer.id;
    order.amount = offer.amount;
    session.amount_total = offer.amount;
    session.metadata = { ...metadata, promotion_package: offer.id };
    const response = await POST(
      request({
        propertyId,
        package: offer.id,
        targetArea: "Brașov",
        notes: "",
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      stripePosts[0].get("line_items[0][price_data][unit_amount]"),
      String(offer.amount),
    );
    assert.equal(stripePosts[0].get("metadata[promotion_package]"), offer.id);
    assert.equal(
      stripePosts[0].get("line_items[0][price_data][currency]"),
      "ron",
    );
  });
}
test("only a signed exact Stripe payment confirms a promotion and never touches publication or video", async () => {
  session.payment_status = "paid";
  session.status = "complete";
  const noSignature = new Request("https://app.example/api/stripe/webhook", {
    method: "POST",
    body: "{}",
  });
  assert.equal((await WEBHOOK(noSignature)).status, 400);
  assert.equal(
    (await WEBHOOK(event("checkout.session.completed", session))).status,
    200,
  );
  assert.equal(applied[0].new_status, "paid");
  assert.deepEqual(writes, []);
  session.amount_total = 100;
  assert.equal(
    (await WEBHOOK(event("checkout.session.completed", session))).status,
    400,
  );
  assert.equal(applied.length, 1);
});
test("sandbox receipts stay sandbox and cannot pass a live webhook", async () => {
  session.payment_status = "paid";
  session.status = "complete";
  session.livemode = false;
  order.livemode = false;
  assert.equal(
    (await WEBHOOK(event("checkout.session.completed", session, false))).status,
    400,
  );
  process.env.STRIPE_CHECKOUT_MODE = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  assert.equal(
    (await WEBHOOK(event("checkout.session.completed", session, false))).status,
    200,
  );
  assert.equal(applied[0].new_status, "paid");
  assert.deepEqual(writes, []);
});
test("late checkout completions read current refund state instead of reactivating a paid budget", async () => {
  session.payment_status = "paid";
  session.status = "complete";
  refunded = 30000;
  assert.equal(
    (await WEBHOOK(event("checkout.session.completed", session))).status,
    200,
  );
  assert.equal(applied[0].new_status, "refunded");
  assert.equal(applied[0].refund_amount, 30000);
});
test("unpaid cancellation expires Stripe and admin campaign updates require a verified admin role", async () => {
  order.checkout_session_id = "cs_promotion";
  assert.equal(
    (await POST(request({ action: "cancel", orderId }))).status,
    200,
  );
  assert.equal(session.status, "expired");
  assert.equal(order.payment_status, "cancelled");
  assert.equal(
    (
      await ADMIN(
        request({
          orderId,
          status: "active",
          spentAmount: 0,
          impressions: 0,
          clicks: 0,
          report: "",
          campaignId: "123",
        }),
      )
    ).status,
    403,
  );
  isAdmin = true;
  assert.equal(
    (
      await ADMIN(
        request({
          orderId,
          status: "active",
          spentAmount: 0,
          impressions: 0,
          clicks: 0,
          report: "",
          campaignId: "",
        }),
      )
    ).status,
    400,
  );
  assert.deepEqual(writes, []);
});

test("an agent can request stopping a sold property even when Stripe payments are off", async () => {
  process.env.STRIPE_CHECKOUT_MODE = "off";
  const response = await POST(
    request({ action: "request_stop", orderId, reason: "sold" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { requested: true });
  assert.deepEqual(writes, ["request-stop"]);
  assert.equal(stripePosts.length, 0);
  assert.equal(
    (await POST(request({ action: "request_stop", orderId, reason: "forged" })))
      .status,
    400,
  );
});
