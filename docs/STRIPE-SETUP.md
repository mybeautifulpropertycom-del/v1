# Stripe test checkout — $97 USD per property

This release prepares **one property website + one presentation video for a one-time $97 USD payment**. It is deliberately **test-only**, as requested. It does not collect real money, enforce a paywall, publish properties, or generate/order a video. Existing publication continues unchanged. Live Stripe keys are rejected. Video integration and live purchase entitlements will be added before launching real payments.

## 1. Apply the additive Supabase installer

On the existing `aqfqhpdfhkegotsigemw` project, open SQL Editor → New query. Copy the **entire** contents of [`supabase/sql-editor-stripe-test.sql`](../supabase/sql-editor-stripe-test.sql), preferably using GitHub's Raw / Copy raw file control. Run the query. Expect **MBP_STRIPE_TEST_OK**.

This creates a private test-order table and a server-only reservation function. It does not delete or change existing properties, profiles, leads, or publication rules. It can be rerun. Do not run the full first-installation SQL file on an existing project.

## 2. Get the Stripe TEST credentials

In Stripe, switch to **Test mode** or a **Sandbox**. Keep the key, webhook, and test payment in the same Stripe account/sandbox.

- Open Developers / API keys (or the API keys page in Workbench).
- Copy the **Secret key** beginning `sk_test_` directly into Vercel. A `pk_test_` publishable key is not needed for this hosted Checkout integration.
- This app uses Stripe Node SDK 23 and API **2026-09-30.endive**.

In Developers / Workbench → **Webhooks**, add an endpoint/event destination:

- Source: **Your account** (not connected accounts).
- Destination type: **Webhook endpoint**.
- URL: **https://www.mybeautifulproperty.com/api/stripe/webhook**
- Events: **checkout.session.completed** and **checkout.session.async_payment_succeeded**.
- Prefer API version **2026-09-30.endive** if selectable.
- Copy this endpoint's **Signing secret**, beginning `whsec_`, directly into Vercel.

There is no need to create a Product, Price, subscription, Payment Link, or Stripe Connect account. The server builds the one-time $97 USD Checkout line item. Adaptive Pricing is disabled so the checkout currency stays USD. No coupons or automatic taxes are configured in this test release.

## 3. Add SERVER variables in Vercel

Project **v1 → Settings → Environment Variables**, environment **Production** for testing through the custom domain:

| Variable | Value |
| --- | --- |
| `STRIPE_CHECKOUT_MODE` | `test` |
| `STRIPE_SECRET_KEY` | Secret TEST key from Stripe, beginning `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | This webhook endpoint's signing secret, beginning `whsec_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server secret key or legacy `service_role` key |
| `NEXT_PUBLIC_SITE_URL` | `https://www.mybeautifulproperty.com` |

**Production is the Vercel environment name, not Stripe live mode. These are still test payments.** For isolated testing on a Preview deployment instead, configure its own HTTPS return origin and reachable webhook in that deployment's environment. A deployment protected by Vercel authentication cannot receive Stripe webhooks without an appropriate access configuration; use the public custom domain for this setup.

Get the Supabase server key from Project Settings → API keys. Under legacy keys, use **service_role**, not anon. A current server secret key is also supported. Do not replace the existing public Supabase key. Never prefix these new secret variables with `NEXT_PUBLIC_`, put them in GitHub, or paste their values into chat.

After saving the variables, **Redeploy** and wait for **Ready**. Copy the values without quotes, spaces, or line breaks. A changed key or signing secret requires another redeploy.

## 4. Complete a test

1. Open a complete saved property, then **Website design**.
2. The **STRIPE TEST MODE** package panel appears with **Try $97 test checkout**.
3. Click it. Existing changes/descriptions are saved first; validation errors must be fixed before checkout.
4. Stripe's hosted test page should show **$97.00 USD** and the package name.
5. Use Stripe's test card **4242 4242 4242 4242**, any future expiry, any three-digit CVC, and a test billing ZIP such as **10001**. Do not use a real card.
6. Complete checkout. The app returns to Website design and waits for the signed webhook. Expect **Test payment confirmed. Thank you!**
7. Check Stripe's test payment record and the webhook delivery response (**200**).
8. Reload the property page; the test confirmation should remain. Trying again must not create another test charge for the same property.

Also test cancelling checkout: the saved property remains and can be retried. A return URL saying `checkout=success` is not proof of payment; only the verified Stripe webhook updates the test order. Pending confirmation can be refreshed with **Check payment status**. Failed webhook saves return an error so Stripe can retry; the dashboard can resend a failed event.

## What is verified locally

Automated tests exercise the Stripe request and signed webhook at HTTP boundaries, without real network payments. Database tests check restricted permissions, stable reservation/idempotency, expiration/retry, confirmation persistence, and retention of test receipts after property deletion. Browser tests cover checkout redirect, cancellation, confirmation, and no publication triggered by payment.

The real Stripe account, webhook delivery and Vercel secrets cannot be checked from this cloud environment. The complete Stripe sandbox test above is still required after configuration.

## Before live launch

The agreed next phase is video integration, then live payments. Do not merely substitute a live API key; this release rejects it intentionally. The live phase must add database-enforced per-property purchase access, fulfilment and regeneration limits for the included video, and refund/dispute handling. Confirm the hosting duration and the refund/delivery terms before displaying them in a live offer. The previously discussed 12-month duration was a suggestion, not an implemented product commitment. Tax collection settings also remain to be configured for the business's requirements.
