# US property maps and nearby places

The integration is opt-in and off by default. It uses **Maps JavaScript API** and
**Places API (New)** with a public, website-restricted browser key. It does not
use a service-account key, the legacy Places service, Routes API, or OpenAI.
Search Console verification does not enable these services.

## What visitors and agents see

- Address suggestions begin after four characters and a 400 ms pause, restricted
  to `us`. Selecting a suggestion completes its autocomplete session and checks
  for a full US street address/building. A city alone or a non-US result is rejected.
  The agent can still enter and save an address manually when suggestions fail.
  Ineligible selections leave manual entry intact without a regional warning.
- The agent's editor saves the selection without showing a map card. The map
  section appears on public landing pages and saved website previews.
  Existing listings acquire a map only when an
  agent selects their address from the suggestions and saves it; no bulk geocoding.
- All three property templates show **Explore the neighborhood** before the
  contact section for selected addresses. The map loads automatically when the
  section approaches the viewport (200 px margin), with Schools preselected.
  There is no introductory card or Show map button. Visitors who never approach
  the section do not trigger its Google requests.
- The map appears on the left and categories with a compact place list on the
  right; on narrow screens they stack vertically. The **Your next home** pin
  marks the property. Schools, Childcare, Restaurants, Parks, Shopping and Culture
  return up to six places within approximately three miles, ordered by distance.
  Schools are requested on initialization; other categories are requested on
  selection. Successful results are reused within the mounted view. This is
  nearby discovery, not an exhaustive list or school zoning advice.
- Numbered pins and list entries correspond. Selecting an entry focuses its
  location within the map. No place photographs, photo metadata, or photo-media
  requests are used. Returned data providers retain their attribution links.
  Custom "Open in Google Maps" / "View place" links are omitted; Google's native
  map attribution is preserved.
- Miles are straight-line estimates; no routing or travel times are claimed.
- Editing an address clears the saved place ID in the editor and inline preview.
  A DB trigger also clears stale IDs on direct updates. Deleting/unpublishing a
  property uses the existing page-access rules.

## Activate on the existing installation

1. Run the entire `supabase/sql-editor-property-maps.sql` in the existing Supabase
   project's SQL Editor. Expect `MBP_PROPERTY_MAPS_READY`. This is an additive,
   repeatable migration: one nullable place-ID field, a validation constraint and
   a trigger. It does not change existing addresses or enable billing. **Do not
   rerun the first-installation SQL** on an existing project.
2. In the intended Google Cloud project, attach billing and enable **Maps
   JavaScript API** and **Places API (New)**. Review current pricing and available
   quotas before enabling production. No paid Google project or key was created
   by this repository change.
3. Create a **browser API key**, with application restrictions set to **Websites**.
   Allow only the production origins used by the application, for example:
   `https://www.mybeautifulproperty.com/*` and, only if it serves pages rather than
   redirecting, `https://mybeautifulproperty.com/*`. Restrict the APIs to Maps
   JavaScript API and Places API (New). Use a separate restricted development key
   for localhost/staging. Do not allow all `*.vercel.app` deployments.
4. Create a **JavaScript Map ID** in Google Maps Management. Advanced markers need
   this ID. A map ID is not an API key. Use the production map ID rather than
   `DEMO_MAP_ID`; a map ID does not make map loads free.
5. Configure Vercel **Production**, then rebuild/deploy:

   ```text
   NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=true
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<restricted browser key>
   NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<JavaScript map ID>
   ```

   These are browser-visible configuration values by design. Never put a Google
   service-account credential or a server-only key in a `NEXT_PUBLIC_` variable.
   Keep the switch false until the migration, key restrictions and quotas are ready.
6. Review the site's privacy notice and Google Maps attribution/terms requirements
   for the production integration, including automatic map loading near the
   viewport. This implementation does not read visitor geolocation.
7. Select a real US address in a test listing and save it. Once published, verify
   its pin on the public page and check all three templates. Test the automatic
   Schools results and Restaurants filter using the configured key, then inspect
   Cloud usage/billing. Mocked tests cannot establish that the live key, enabled
   APIs or quotas are correct.

## Cost control and data handling

- Billable operations depend on Google's current SKU rules: autocomplete and its
  terminating Place Details request, place details when the map section is
  approached, dynamic map loads and Nearby Search. No dollar cost or free allowance is
  assumed here. Field masks are explicit and never `*`; we omit reviews, ratings,
  opening hours, contact information and route calculations.
- Configure low API request quotas where the chosen API exposes them, plus billing
  alerts. **Budget alerts are not hard spending caps.** Per-minute quotas also do
  not impose a monthly dollar ceiling. Quotas apply to the Google project, so
  account for other applications sharing it. Browser throttling is a UX measure,
  not a tamper-proof billing limit.
- Each public visit or saved-preview visit that reaches the map section can incur one map load, one home Place
  Details request and one Schools Nearby Search. Scrolling away and back does
  not repeat these requests. There are no automatic retries, panning-triggered
  searches or photo requests. Other categories load on selection.
  Category results stay only in the current component's memory and are discarded
  on navigation/address changes. A reload/new visitor can incur new requests.
- Persist only the agent-confirmed listing address and a Google place ID. Do not
  persist Google coordinates, place descriptions, photo URLs, or third-party
  photos in Supabase, IndexedDB, localStorage, a CDN, or the website's AI text.
- If Google fails or a quota is exhausted, show a useful message and allow an
  in-page retry. Property text, photos, forms, publication and payment
  flows do not depend on Google being available.
- To disable new in-app requests, set the enabled flag to `false` and redeploy.
  For an immediate provider-side cutoff, disable/restrict the API key in Cloud;
  already-open pages may retain the configuration from their original build.

Official configuration/pricing references (verify current terms before activation):

- https://developers.google.com/maps/documentation/javascript/get-api-key
- https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
- https://developers.google.com/maps/documentation/javascript/nearby-search
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://mapsplatform.google.com/pricing/

## Validation

`npm run typecheck`; `node --import tsx --test tests/property-location.test.ts
tests/property-maps-database.test.ts`; `npx playwright test --config
playwright.maps.config.ts`; production build and existing relevant regression
tests. Browser tests use a separate dev server with fake public credentials,
stub the Google JS SDK, and block Google hosts. They make no billable API calls.
