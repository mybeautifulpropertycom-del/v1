# Account deletion, draft retention and owner downloads

Deploy the application, run `supabase/sql-editor-account-lifecycle.sql` once in the existing Supabase SQL Editor, then run `supabase/configure-account-cleanup.sql`. Expected results: `MBP_ACCOUNT_LIFECYCLE_READY` and `MBP_ACCOUNT_CLEANUP_SCHEDULED`. The scheduler reuses the site URL and CRON_SECRET already stored in Vault for video processing; no new secrets are required. The full setup installer is only for new projects.

## Administrator actions

The Agent accounts and All properties lists offer Delete with confirmation. Every server request verifies Supabase identity and the protected administrator role; the database verifies the actor again. An administrator cannot delete their own account or any other administrator account here. An active unfulfilled checkout temporarily blocks deletion. Existing payments are retained for accounting and are not refunded by deletion.

Deleting a property removes its public page immediately and preserves its leads in the agent inbox. A before-delete trigger records exact storage prefixes before purchase foreign keys are detached; private scene rows are removed, and accepted BytePlus quota reservations remain until the provider's terminal result is reconciled. This applies to existing agent-owned deletion as well as the new administrator action.

Deleting an account records a durable tombstone, removes its properties, and requests an Auth ban. Database guards block new properties, and restrictive Storage policies block further uploads/updates even with a still-valid JWT. The cleanup worker removes all four managed asset directories for that owner: property-images, property-videos, property-video-work, agent-avatars. Only after Storage cleanup succeeds does it delete the Auth user, cascading the profile and leads. Until then the administrator list shows Deletion in progress. Payments/audit records retain only their existing references where the schema allows them; these operations are not a financial-record erasure workflow.

File cleanup begins at least ten minutes after deletion, allowing already-running short-lived render/upload workers to finish. The scheduler runs every five minutes. Storage failures keep the private job pending with a retry in fifteen minutes; it never reports completion or deletes the Auth user before all managed paths have been cleared. Work is leased, bounded and resumable; recursive pagination repeatedly drains offset zero. No SQL directly deletes Storage metadata. Removing the scheduler pauses cleanup; inspect private account_cleanup_jobs for pending jobs and last_error. Already accepted provider generations cannot be refunded/cancelled by this feature, but deleted properties cannot schedule or publish new work.

## Fourteen-day drafts

New properties receive a server-controlled expiry fourteen days after creation. Editing does not renew it. Existing drafts receive fourteen days from the first installation of this migration; rerunning the installer does not reset the deadline. The scheduled worker removes at most 100 eligible drafts per pass and queues their files for cleanup.

Only never-published drafts without paid, complimentary or legacy publication access qualify. Paid/refunded/disputed orders and active pending checkout reservations are protected. Publication permanently records first_published_at, so later unpublishing does not cause automatic deletion. Account deletion itself is always an explicit administrator action, never automatic because of inactivity. Expiry and deletion use property locks and recheck entitlement/payment state before deleting.

## Video downloads

All template video players hide the native download control, suppress the video context menu and omit direct fallback file links. The owner-only preview toolbar offers Download video for a published property with a saved film. Its server endpoint verifies current user ownership, publication entitlement and the exact managed Storage path, then creates a sixty-second signed attachment URL. Anonymous visitors, other agents and administrators who do not own the property cannot use this endpoint.

This restricts the product's download feature; it is not DRM. Public playback still uses the existing public video bucket. A technically knowledgeable viewer can retrieve a playable media URL or record the screen, and browser support for controlsList varies. No stronger copying guarantee is claimed.

## First profile completion

The database records the first valid profile completion once. Existing complete profiles are backfilled. On the first successful completion in My profile, the app shows its success message and navigates to My properties after three seconds. Later edits and failed saves remain on the profile page; navigating away cancels the timer.

## Verification

Local PostgreSQL tests cover roles, protected admins, draft/payment retention, immutable timestamps, deletion tombstones, scoped storage jobs and worker leases. Mocked HTTP tests cover download ownership, publication, managed paths, administrator verification and cron authorization. Storage tests cover recursive pagination and retry after failures. Connected browser tests use intercepted Auth/Storage responses to verify confirmation and one-time profile navigation. No production account or file is deleted by these checks.
