# Card checkout

Property publication uses Checkout Sessions with `ui_mode: elements` and Stripe's
Payment Element. The application renders one amount in the “Plătește 249 RON”
button; it does not embed Stripe's product summary or contact form.

- The authenticated checkout route reads the owner's saved profile. Name, email
  and phone supplied in the request body are ignored.
- A Stripe customer is created for the order attempt with those contact details,
  using an idempotency key. Reopening an existing Elements session refreshes that
  customer's contact details from the saved profile. This does not attach or save
  a card for future purchases.
- Only card payments are enabled. Link is disabled on the session and the element;
  Apple Pay and Google Pay are hidden. Saving and redisplaying payment methods are
  disabled, and confirmation explicitly sets `savePaymentMethod: false`.
- The element receives the saved profile's name as a default; email and phone
  stay on the Stripe customer. Name, email and phone inputs are hidden. Billing address collection uses
  `if_required`: Stripe may require a country/postal code or bank authentication.
  No billing address is invented from the property's address.
- Email stays on the server-created Stripe customer. Do not supply `email` again
  in SDK defaults or confirmation: Stripe rejects updating a session whose
  customer already has an email. The browser fixture rejects those updates too.
- Phone also stays on that customer. Do not pass `phoneNumber` to Checkout
  defaults/confirmation when phone collection is disabled. Enabling collection
  would unnecessarily ask the buyer for their number again. The browser fixture
  rejects email and phone updates at initialization and confirmation.
- Failed confirmation stays in the same form for correction and retry. Success
  enters the existing server reconciliation flow; a browser callback cannot grant
  publication rights.

An unpaid, open hosted or full embedded session is expired before creating its
replacement. The existing compare-and-swap attempt rotation and webhook checks
remain in place. Completed/paid sessions go through reconciliation and cannot
offer another charge. No database migration or new environment variable is needed.

Validation: server tests cover contact provenance, pricing, session replacement,
reuse, paid-session handling and publication fencing. Browser tests stub Stripe.js
at its script boundary and cover desktop/mobile layout, hidden contact fields,
SDK settings, declined-card retry and server-confirmed publication. These tests
do not establish that live Stripe accepts a payment; a live payment has not been
performed as part of this change.
