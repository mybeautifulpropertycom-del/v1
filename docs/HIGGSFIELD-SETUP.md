# Higgsfield: configurable models and asynchronous property video delivery

The integration uses the official `@higgsfield/client/v2` SDK for non-blocking submissions and its documented authenticated `/requests/{id}/status` endpoint for resuming requests. Model endpoints and input/output shapes are configuration, not branches in the worker. Credentials are loaded only on the server, at runtime. Building/deploying without credentials is supported.

Sources: [requested official SDK guide](https://docs.higgsfield.ai/docs/how-to/sdk), [official SDK repository](https://github.com/higgsfield-ai/higgsfield-js), and published `@higgsfield/client` version **0.2.6**. The requested documentation host returned a proxy 403 in this workspace; the implementation was checked against the official published README, types and executable source. That source returns raw V2 responses, despite an outdated README section describing `JobSet` objects. Its V2 webhook implementation forwards the callback URL but does **not** send the `secret` option; we therefore use per-attempt callback tokens and verify results through the authenticated API.

## One-time database upgrade

On the existing Supabase project, run the **entire** [Higgsfield installer](../supabase/sql-editor-higgsfield.sql), after the previously completed publish-workflow installer. Expect **MBP_HIGGSFIELD_READY**. It adds job leases, provider IDs, pinned model/input snapshots and a public `property-videos` Storage bucket (MP4/WebM, up to 50 MiB each). It does not generate a video, delete property data or charge credits. Reapplying this installer is supported. Do not rerun older installers after it, because they contain older versions of shared functions.

## Vercel configuration

Project **v1 → Settings → Environment Variables → Production**:

| Name | Value | Vercel type |
| --- | --- | --- |
| `HF_API_KEY` | Higgsfield API Key ID | Secret |
| `HF_API_SECRET` | Matching API Key Secret | Secret |
| `CRON_SECRET` | A random secret, at least 32 characters | Secret |
| `HIGGSFIELD_MODEL` | A configured profile name | Config |
| `HIGGSFIELD_MODELS_JSON` | Optional JSON profiles overriding/adding file profiles | Config |
| `HIGGSFIELD_ENABLED` | `false` during setup; `true` to submit paid video requests | Config |

Alternatively, use **one** `HF_CREDENTIALS` secret in `KEY_ID:KEY_SECRET` format instead of the two separate values. `HF_KEY` is also accepted for compatibility with the Python SDK naming. Do not set multiple credential formats. Never use a `NEXT_PUBLIC_` prefix for credentials. Add them in Vercel, not in chat or GitHub.

Existing `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SITE_URL=https://www.mybeautifulproperty.com` are reused. Generate the worker secret locally with `openssl rand -hex 32`; use the same value in the scheduler below. Redeploy after environment changes.

`npm run higgsfield:check` checks local configuration and reports the selected endpoint/output shape without printing secrets, contacting Higgsfield or spending credits. This is not an API-account or credit-balance verification.

## Switching models without changing the implementation

Profiles live in [config/higgsfield-models.json](../config/higgsfield-models.json), or in the `HIGGSFIELD_MODELS_JSON` environment variable. Set `HIGGSFIELD_MODEL` to a profile name and redeploy. New jobs use the selected profile; existing jobs retain their original endpoint, inputs and output path.

The file contains **one explicitly named example**, `dop-turbo-example`, copied from the SDK's documented DoP input shape. It uses only the first photograph and is **not selected automatically**. Confirm current account access, availability, accepted fields and API pricing before using any model. There is no invented universal price or automatic model fallback.

A profile has this structure (replace the illustrative endpoint/fields with those documented for the model you select):

```json
{
  "my-property-model": {
    "endpoint": "vendor/model/image-to-video",
    "input": {
      "prompt": { "$ref": "prompt" },
      "image_urls": { "$ref": "images" },
      "duration": 10,
      "aspect_ratio": "16:9"
    },
    "output": { "kind": "video", "path": "video.url" }
  }
}
```

The example above demonstrates mapping; it does not claim that `image_urls`, `duration` or `aspect_ratio` are accepted by every model. Input keys and literal JSON values are passed through unchanged. A sole `{"$ref":"path"}` object inserts the referenced value with its original JSON type, including arrays/numbers. Missing references fail before any paid submission. Available context:

| Reference | Value |
| --- | --- |
| `prompt` | Factual real-estate camera/preservation prompt, with saved property facts |
| `images` | Array of the property's saved photo URLs |
| `images.0` | First photo URL |
| `image_objects` | Array of `{ "type": "image_url", "image_url": "…" }` |
| `property.title`, `property.description`, etc. | Saved title, description, location, type, bedrooms, bathrooms, area, area_unit, amenities |

Use `output.path` for different response layouts, such as `video.url` or `outputs.0.url`. The generic `submitGeneration()` transport supports arbitrary queued Higgsfield model endpoints and JSON inputs, including image/audio models, and preserves their raw response fields. The **property delivery worker** requires a video-output profile because the page displays a video player. An image generator does not become a video generator by changing its name. Separate image/audio workflows can use the same transport.

A full multi-room montage is also different from animating a single photo. If a model supports multiple references, map `images` using its documented schema. Otherwise it produces a clip from the selected input; this implementation does not silently generate one paid clip per photo or concatenate them. A dedicated multi-clip editing/rendering workflow remains a separate product choice. Model access, maximum reference counts, duration, resolution and cost come from the provider's current model contract.

## Background scheduling

A verified live Stripe payment publishes the website and queues its video. Stripe completion and manual video retry wake the worker through Next.js `after()`. A scheduler is still required to recover missed callbacks, resume downloads and process queued jobs while nobody is online.

The supplied scheduler uses **Supabase Cron + pg_net + Vault**, so it does not require Vercel's per-minute Cron feature:

1. Run [configure-higgsfield-scheduler.sql](../supabase/configure-higgsfield-scheduler.sql) in Supabase SQL Editor. Expect `MBP_HIGGSFIELD_SCHEDULER_READY`. This installs the admin-only setup function; it does not yet schedule requests.
2. Execute the following separately, replacing the placeholder with the same worker secret stored in Vercel (do not share it):

   ```sql
   select public.configure_higgsfield_schedule(
     'https://www.mybeautifulproperty.com',
     'YOUR_CRON_SECRET'
   );
   ```

   Expect `MBP_HIGGSFIELD_SCHEDULED`. The function stores the URL/secret in Vault and creates or updates one named cron job, every minute. Enable the extensions in the Supabase dashboard if your project restricts extension installation. This platform-specific script cannot be validated in local PGlite; confirm the first successful pg_net response in your project.

3. Finish model/credential setup, set `HIGGSFIELD_ENABLED=true`, and redeploy. **This can process already queued paid properties and spend Higgsfield API credits.** API access/balance must be available for the chosen model.

Alternatively any authenticated scheduler may call `POST /api/video/worker` with `Authorization: Bearer <CRON_SECRET>`. `GET` is also supported for Vercel Cron if your plan supports the desired interval. Configure only one recurring scheduler. Each invocation claims at most one job; leases prevent overlapping submissions. A minute schedule is suitable for initial traffic; larger queues need more worker throughput. Scheduled calls consume normal hosting/database usage.

To pause all generation/polling, set `HIGGSFIELD_ENABLED=false` and redeploy. In-flight provider jobs may still complete; their IDs can be recovered through callbacks. To remove the recurring schedule: `select cron.unschedule('mbp-higgsfield-worker');`.

## Completion, storage and failures

- No client can choose a billable endpoint, alter a price, claim another agent's job or write provider results. The server uses the private paid-order queue and checks paid access in the claim/bind/completion transactions.
- A job is claimed with a four-minute lease. The server submits once with SDK retries disabled and immediately saves the provider request ID. No request waits for the complete render inside an HTTP function.
- Higgsfield receives an HTTPS callback URL containing a per-order/per-attempt HMAC token derived from `CRON_SECRET`. The token is not the worker secret. Callback media URLs and statuses are never trusted: the server fetches the request from Higgsfield again. Old-attempt, refunded and deleted jobs are ignored.
- The scheduler polls the same provider request. Changing the selected model or receiving duplicate callbacks cannot create another render for an already submitted job.
- Completed videos are downloaded without credentials, using public IPv4 DNS validation and a pinned address on every redirect. Downloads are bounded to 30 seconds/50 MiB and checked for MP4/WebM signatures. Private addresses and redirects to non-HTTPS URLs are rejected. IPv6-only media hosts are not supported by this downloader.
- The file is saved to `property-videos/<owner>/<order>/<attempt>.mp4` (or `.webm`). Only then does the atomic completion update attach the durable Supabase URL and mark the entitlement delivered. Public pages and the editor use the existing film player. The editor refreshes video status every 15 seconds while visible.
- A transient status/download/storage failure resumes the **same** provider job. It does not generate a new video. If a submission times out before its ID is saved, the job enters `uncertain` rather than submitting twice. A valid late callback can recover it.
- Explicit provider failures can be retried by the owner after a one-minute cooldown, up to three generation attempts per package. The website stays live. Retries do not charge the customer again, but may consume provider credits according to its billing rules. There is no unsupported idempotency-header assumption.
- Refunds/disputes cancel delivery. A job already accepted externally may still incur provider cost. Existing public Storage media URLs are not access-revoked merely by unpublishing a page; the public page itself follows the existing publication gate. Orphaned upload cleanup and retention are operational tasks.

For an `uncertain` job, use the Higgsfield account's request history and the private `property_video_jobs` row to identify the original request. An administrator can call `bind_property_video_request(order_id, attempts, request_id)` to attach that verified request; the next worker verifies its status through the API. Do not clear its state and resubmit until the provider confirms that no original generation was accepted. Rotate `CRON_SECRET` with care: callbacks created with an older secret will stop verifying, although stored request IDs continue to be polled.

## Verification and activation boundary

Local tests cover the official SDK transport with multiple input/output shapes, failed/ambiguous submissions, fixed-host authenticated status reads, callback authentication, real PostgreSQL leases and paid/refunded enforcement, model snapshots, retries, durable media delivery, and the existing payment/editor flow. External services are mocked. The Supabase scheduler, account-specific model schema/pricing and one actual generation require verification in the configured live services after credentials are added. No real generation or API credit spending was performed during implementation.
