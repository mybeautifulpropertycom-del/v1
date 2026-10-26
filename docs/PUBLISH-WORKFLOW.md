# Preview, pay and publish

Agents create and edit a private website before paying. **Open website editor** follows the template selection step; **Edit website** on the property card opens that same editor. **Publish Property** in the editor toolbar and its video section saves the current draft and opens a modal containing the $97 USD offer and Stripe's embedded payment form. Closing the modal preserves the draft.

## Upgrade the existing production project

1. Supabase → SQL Editor → New query: run the **entire** [publish workflow installer](../supabase/sql-editor-publish-workflow.sql). It requires the previously installed Stripe live schema and returns **MBP_PUBLISH_WORKFLOW_OK**. It adds private publication/video state and replaces functions/triggers, without deleting existing properties or leads. It can be rerun. Applying it does not publish drafts or charge cards.
2. Vercel → v1 → Environment Variables → Production: add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with the `pk_live_…` key from the same Stripe account as the existing secret key. **Config** is correct for this public browser key. Keep `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` as server secrets.
3. Keep the existing live configuration and webhook destination/events. Deploy the current `main` commit. No Stripe Product or Price needs to be created manually.

## Payment and publication

The server validates the signed-in owner and saved property/profile before reserving a purchase and publication intent. The Stripe amount remains fixed at 9700 cents, USD. Open embedded sessions are reused; an existing open hosted session is expired before replacing it. A saved paid/legacy entitlement skips payment.

The existing verified webhook updates the purchase. In the same database transaction, a paid purchase with publication intent publishes the property and creates one durable video job. This works if the agent closes their browser. The client waits for server-confirmed publication; a checkout callback alone never unlocks the page. Repeated events do not publish deliberately unpublished pages or duplicate video jobs.

If the property becomes invalid while payment is open, the paid receipt is retained and the agent can fix the details and publish without paying again. Published pages remain editable. Full refunds and open/lost disputes unpublish the page and cancel its video job; the existing dispute/refund rules still apply.

## Video delivery boundary

**Video delivery is implemented by the optional [Higgsfield worker](HIGGSFIELD-SETUP.md). Apply that upgrade and configure its credentials, model and scheduler to activate generation.** The private `property_video_jobs` table is the delivery queue. Pending videos appear only in the agent's editor. The public website displays a player only when a paid job has `status='completed'` and an HTTPS `video_url`. A failed job can be requeued by its owner without a new charge.

The Higgsfield worker claims paid jobs, submits once, tracks the provider request, saves completed media in Supabase Storage and updates the film URL. A model can be changed through configuration. See its setup guide for retries, uncertain submissions and remaining live-service verification.

Legacy properties receive publication access but no paid video order. They should not be reported as rendering a video.

## Verification

The automated tests exercise real PostgreSQL functions locally and mock Supabase/Stripe HTTP services and the embedded browser form. They cover owner isolation, fixed pricing, paid automatic publication, duplicate events, refund cancellation, no-charge retries, private editing, modal cancellation and confirmation. They do not collect a live payment or verify the production account's iframe/webhook settings.
