# Publication packages

## Free photo publication

The publication chooser offers **free publication with photographs** and **249 RON for the presentation with a video**. The free option publishes directly after the usual property and profile checks. The database records a zero-cost entitlement and leaves previous payments and video orders intact.

For the existing production project, run [sql-editor-free-photo-publication.sql](../supabase/sql-editor-free-photo-publication.sql) in Supabase SQL Editor. Expect `MBP_FREE_PHOTO_PUBLICATION_READY` before deploying the application to Vercel. The migration requires the original publication packages to be installed and can be run again safely.

## Original paid packages and installation history

Clients choose before Stripe opens: **149 RON** for the presentation with photos, or **249 RON** including the existing presentation film. The card form continues using saved profile contact details, without Link or saving payment details. The choice can be changed before payment; the previous Stripe session is expired before its durable attempt is rotated. Completing/paid sessions are reconciled instead of offering another charge.

Administrators can choose in an agent's review page and in their own editor. Both publications are complimentary. Photos are selected initially to avoid accidental video credit use; selecting the film explicitly explains that provider credits are consumed. Existing paid or granted packages are retained. This version does not sell upgrades to an already confirmed package or retroactively cancel accepted film generations.

`property_orders.includes_video` is server-only and bound to the exact tariff by a database constraint. Existing 249 RON and historical 97 USD receipts remain video packages. New photo-only fulfilment publishes the listing, records `video_status=not_ordered` and creates no queue job. An independent queue trigger rejects jobs for photo-only orders. Retry/rebuild functions have no eligible job to process. Public RPC responses gate film URLs by the entitlement; all three themes also respect `videoIncluded=false`, including their editor previews. Sample templates still show their sample film.

## Install on the existing production database before deploying the application

1. In the **existing** Supabase project, open SQL Editor and execute the entire `supabase/sql-editor-publication-packages.sql` in one query. It is transactional and repeatable. It requires the already installed Romania tariff, platform administrator, film workflow and address URL upgrades. It does not charge, publish drafts, call a provider or grant new administrator roles. Keep all existing secrets, worker configuration, billing settings and webhooks.
2. Expect `MBP_PUBLICATION_PACKAGES_READY`. Do not run the full first-installation `sql-editor-setup.sql` on the existing project.
3. Deploy this application version to Vercel Production after the SQL succeeds. No new Stripe product, price ID, key or environment variable is required: the server creates the correct fixed line item using the existing integration.
4. Verify the chooser and administrator photo publication with an unpublished property. Confirm the public presentation has no video section and there is no `property_video_jobs` row for its order. Existing film publications continue normally.
5. A real customer purchase and provider generation remain separate live checks. Repository verification uses mocked Stripe/provider responses and an isolated PostgreSQL-compatible database. No real payment, email or paid generation was made by these tests.

The old application remains compatible immediately after the SQL upgrade, while it still offers only the old package. After taking 149 RON payments, keep an application version that recognises those receipts; do not redeploy an older billing implementation or reapply the earlier single-tariff SQL over this upgrade.

## Verification completed during implementation

- Production build including TypeScript.
- 54 server/database checks covering Stripe sessions, exact tariff matching, signed receipt fulfilment, active-session fencing, complimentary access, publication gates, address links, lifecycle cleanup and the BytePlus shared queue.
- 24 browser checks covering package selection before card creation, 149/249 RON card totals, changing the selected package, card declines, repeated confirmation, administrator publication and video visibility for Editorial, Minimal and Panorama before/after reload and on public pages.
- Desktop/mobile chooser screenshots and checks for overflow. Provider and payment boundaries are stubbed; these results do not claim production activation.

## Activation progress — 17 November 2026

The owner supplied the existing Supabase project's successful SQL result, `MBP_PUBLICATION_PACKAGES_READY`. The application can now be deployed to Production. Vercel readiness and the first live photo-only publication remain separate checks; no live payment or provider generation has been performed as part of activation.
