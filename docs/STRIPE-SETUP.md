# Stripe — $97 USD per property, test and live

The package is **one property website + one presentation video**, a **one-time $97 USD payment**, not a subscription. Both Stripe modes are implemented; changing mode needs configuration and a redeploy, not a Stripe code change.

The current flow is **preview and edit → Publish Property → embedded Stripe payment → automatic publication**. Live payments have been enabled by the project owner; Higgsfield delivery is available through the optional model-configurable worker; see [Higgsfield setup](HIGGSFIELD-SETUP.md) to activate it. See [publish workflow setup](PUBLISH-WORKFLOW.md) for the required upgrade.

## 1. Supabase: one additive installer

On project `aqfqhpdfhkegotsigemw`, open SQL Editor → New query. Copy and run the **entire** [`supabase/sql-editor-stripe-live.sql`](../supabase/sql-editor-stripe-live.sql). Expect **MBP_STRIPE_LIVE_READY**.

This includes the sandbox setup, so it works whether or not the earlier Stripe test installer was applied. It is rerunnable. It adds private payment tables and a publication trigger; it does not charge anyone or activate the payment gate. The trigger is replaced on reruns, which can produce Supabase's generic destructive-operation warning; existing listings, profiles and leads are not deleted. Never run the first-installation SQL on the existing database.

## 2. Stripe: live key and webhook

Use the Stripe **live account**, outside Test mode / Sandbox. Complete Stripe's account activation if Stripe requires it before accepting payments.

- Developers / API keys: copy the **Secret key**, beginning `sk_live_`, directly into Vercel.
- Copy the matching `pk_live_…` publishable key into `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for the embedded payment form. This public value can use Vercel **Config**.
- Developers / Workbench → Webhooks: add an event destination for **Your account**, type **Webhook endpoint**.
- Endpoint: **https://www.mybeautifulproperty.com/api/stripe/webhook**
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `charge.refunded`
  - `charge.dispute.created`
  - `charge.dispute.updated`
  - `charge.dispute.closed`
- Copy this LIVE endpoint's **Signing secret**, beginning `whsec_`, directly into Vercel.
- The SDK uses API **2026-09-30.endive**. Prefer that event version if selectable.

Keys and webhook secrets must belong to the same Stripe account and mode. No manual Product, Price, Payment Link, subscription or Stripe Connect setup is required: the server creates the fixed one-time line item. Adaptive Pricing is disabled to retain USD. This implementation does not add coupons, automatic taxes or a hosting-expiry promise.

## 3. Vercel: live configuration

Project **v1 → Settings → Environment Variables → Production**:

| Variable | Value now |
| --- | --- |
| `STRIPE_CHECKOUT_MODE` | `live` |
| `STRIPE_LIVE_PAYMENTS_ENABLED` | `true` to accept purchases; `false` to pause new checkout sessions |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (public Config) |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | LIVE endpoint signing secret, `whsec_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server secret or legacy `service_role` key |
| `NEXT_PUBLIC_SITE_URL` | `https://www.mybeautifulproperty.com` |

Get the Supabase server key from Project Settings → API keys (legacy keys → `service_role`, or a current server secret key). Do not replace the existing public Supabase key. All Stripe and service-role secrets are server-only: never prefix them with `NEXT_PUBLIC_`, commit them to GitHub or share their values in chat.

Redeploy after saving and wait for **Ready**. Apply the [publish workflow installer](PUBLISH-WORKFLOW.md) after the live installer. With purchases enabled, **Publish Property** in the private website editor opens the embedded payment modal. A successful deployment is not evidence that a real charge or webhook delivery has been tested.

## 4. Publication access

The first authenticated request to the billing status/checkout API activates the persistent database gate. Open a private website editor once after deployment to complete this activation. In one transaction:

- Properties already **published** receive legacy publication access; their existing pages remain available without a retroactive charge. This does not create a paid video order for those properties.
- Other properties require their own confirmed live payment to publish.
- The gate applies to direct Supabase writes as well as the UI. Sandbox receipts cannot unlock it.

The agent flow is **Save → Open website editor → Edit and review → Publish Property → Pay $97 in the modal → Automatic publication**. Only verified payment grants access. The database atomically publishes the property and queues its video job; see [delivery state and integration boundary](PUBLISH-WORKFLOW.md). Generation starts only when the separately configured Higgsfield worker is enabled.

A paid property can be edited, unpublished and republished without another publication charge. Paid and already-published legacy properties do not get another checkout offer. The price is for one saved property/page; it does not cover a second property.

Setting `STRIPE_LIVE_PAYMENTS_ENABLED=false` again pauses creation of new Checkout sessions while keeping webhook processing and existing paid access active. Already-open Stripe sessions can still complete. It does **not** disable the database paywall. Do not switch a launched production deployment to `test` or `off` to pause sales; retain live mode and use the launch flag. The database gate is deliberately not disabled by client actions or an environment-mode change.

## Sandbox testing (optional, same code)

To test before launch, set `STRIPE_CHECKOUT_MODE=test`, use matching `sk_test_…` and `pk_test_…` keys and the matching test endpoint's `whsec_…`. The live launch flag has no effect in test mode. Redeploy.

Open **Publish Property**, then use Stripe's test card **4242 4242 4242 4242**, any future expiry, any three-digit CVC and a test ZIP such as **10001**. Test payments remain separate from live publication and video delivery. Closing the modal preserves the draft. Never use test cards in live mode or real cards in test mode.

Use a separate preview deployment/database for ongoing sandbox tests after live launch. A Vercel deployment protected by authentication cannot receive ordinary Stripe webhook deliveries; use a publicly reachable endpoint or configure suitable access.

## Refunds, disputes and delivery state

Full refunds and open/lost disputes revoke the purchase and unpublish the affected property. Partial refunds retain access. A won dispute restores purchase rights but does not automatically republish the page. Full refunds remain revoked; repurchasing a refunded/disputed property requires support rather than silently creating another charge.

Stripe's current PaymentIntent, charge and dispute state is checked before the atomic database update. Duplicate/stale events cannot restore a refunded purchase. Failed database processing returns an error so Stripe can retry; operators can also resend failed webhook deliveries in Stripe. Payment receipts survive property deletion. Deleting a page is not a refund and does not issue money automatically.

The private `property_orders` ledger stores payment entitlement; `property_video_jobs` tracks queued delivery, retries and the completed video URL. The next Higgsfield integration should process only active paid orders, write `video_status=delivered` after successful fulfilment and respect revoked/cancelled purchases. It must not deliver video from sandbox receipts.

## Verification and remaining rollout work

Automated tests cover fixed-price live/test checkout, authentication, duplicate prevention, signed webhooks, real PostgreSQL publication enforcement, ownership, refunds, disputes, mode separation and the UI. They use mocked external services and make no real charges. The actual Stripe account, Vercel secrets and webhook delivery must still be verified in the configured deployment.

Remaining launch work includes Higgsfield fulfilment and customer-facing delivery/refund/hosting terms, plus any applicable tax handling. A twelve-month hosting period was previously suggested but has not been agreed or implemented. These product choices are separate from switching Stripe modes.
