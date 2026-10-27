# Property address URLs

The editor's **Address** field uses the existing `properties.location` column. On publication, PostgreSQL assigns a unique `address_slug` and the public page lives at `/<address_slug>`. All three templates share this routing.

For an existing installation with the admin schema installed, run the entire `supabase/sql-editor-address-urls.sql` in one Supabase SQL Editor query. Expect `MBP_ADDRESS_URLS_READY`. This creates address URLs for existing published properties too; it does not charge customers or request videos. Deploy the application before running the SQL so the root route is available. Before the SQL upgrade, the application still serves `/p/<slug>`.

The database owns URL allocation; browser-provided `address_slug` values are ignored. Addresses are normalized to lowercase, diacritics and punctuation are removed, and spaces become hyphens. Duplicate addresses receive `-2`, `-3`, etc. App route names are reserved. Non-Latin-only addresses fall back to `property` plus a collision suffix. Empty addresses still fail the existing publication checks.

`property_url_slugs` is a private registry containing immutable legacy slugs and all address aliases. Only the published-property RPC resolves it for visitors. Address edits on a published property allocate the new URL; previous addresses and `/p/<legacy-slug>` redirect to the current URL. Redirects use 307 because an agent can restore an earlier address. Canonical metadata points at the current URL. Drafts, unpublished listings, and deleted listings are not publicly resolvable. Deleting a property cascades its registry entries.

Forms continue sending the immutable property slug, so existing lead routing and rate limits remain intact. Billing and complimentary admin publication retain their existing authorization and entitlement checks. The admin publication response, billing status, copy-link actions, and website links use the allocated address URL. The address is not a publicly usable URL before publication.

Do not re-run older feature installers after this upgrade: they redefine shared public-property and admin-publication functions. Reapply the address URL installer if an older installer was needed; the upgrade is idempotent.
