# SEO and Google Search Console

## What the application does

- `/` serves the existing sign-in experience as HTML with HTTP 200, a service-specific title and description, a canonical URL, Open Graph/Twitter metadata, and linked Organization/WebSite JSON-LD using the actual brand, domain and logo. A valid signed-in session still redirects to `/panou` in the browser. `/autentificare` uses the same metadata and canonicals to `/`. Approved visible text and design remain unchanged.
- Each **published** property automatically gets a title based on its headline/location, a description from the current reader-facing presentation copy (rather than source notes when valid prepared copy exists), its current canonical address URL, cover-image sharing metadata, and RealEstateListing JSON-LD. This applies to all three designs and future properties. Old URLs continue using the existing redirects. Unpublished/missing properties return 404 with noindex.
- Dashboard/admin screens, previews, template samples, registration and password-reset pages remain noindex. Robots permits fetching their noindex tags and application assets; API routes are disallowed. Vercel preview deployments opt out of indexing.
- `/sitemap.xml` is a sitemap index. `/sitemap.xml/main.xml` contains the homepage. Property sitemaps contain up to 1,000 current published URLs each. New publications, edits and unpublishing are reflected automatically; Vercel caches XML for up to five minutes. Dates come from database updates, not the request clock. Drafts, old URL aliases, private contact data and demo listings are excluded.
- Database failures return a temporary 503, rather than a misleading empty property sitemap.
- The approved house logo is available as `/icon.svg`, a 96×96 `/icon.png` and a 48×48 `/favicon.ico`. Next.js adds the icon links to the HTML head. All three assets are public and crawlable; no Search Console favicon upload is needed.

## Activate on the existing installation

1. Run the entire **`supabase/sql-editor-public-sitemap.sql`** in the existing project's Supabase SQL Editor. It is an additive, repeatable update: an index and a read-only RPC. It does not alter existing listings or table RLS. Expect `MBP_PUBLIC_SITEMAP_READY`. Do not rerun the full first-installation SQL on an existing project.
2. In Vercel Production, ensure `NEXT_PUBLIC_SITE_URL` equals the primary HTTPS domain (without a path). The existing canonical default is `https://urmatoarea-proprietate.ro`. The apex is the primary domain; redirect the optional `www` hostname to it. The secondary hostname should redirect to the primary in Vercel's domain settings. Rebuild after changes. Existing public Supabase configuration is reused; no new credential or service-role key is needed for sitemap discovery.
3. Deploy `main`. Verify `/`, `/robots.txt`, `/sitemap.xml`, `/sitemap.xml/main.xml` and a published property URL on the real domain. Check that canonical URLs match the primary hostname and the XML contains actual published listings. An XML 503 usually means the RPC upgrade or the database connection still needs attention.
4. In Search Console, add a **Domain** property for `urmatoarea-proprietate.ro` and keep its DNS verification record. In that verified property's **Sitemaps**, submit `https://urmatoarea-proprietate.ro/sitemap.xml`. Google discovers the child sitemaps automatically; you do not submit a new sitemap for each future listing.
5. In **URL inspection**, inspect the homepage and one public property, run **Test live URL**, then **Request indexing** if available. Monitor **Page indexing**, **Sitemaps**, **HTTPS** and **Core Web Vitals**. Search Console access and sitemap submission are separate from repository deployment.

## Owner-reported live progress — 16 November 2026

- Ownership verification succeeded for the new domain.
- The owner's live XML screenshot shows the correct new-domain sitemap index with `main.xml` and `properties-1.xml`. Sitemap discovery is already activated on the existing database; do not repeat the SQL activation just because Search Console has not populated its counts.
- The owner's Search Console screenshot shows **Success**, with **0 discovered pages** immediately after submission. Success confirms retrieval of the index, not completed child-sitemap processing or page indexing. Counts may lag. Open the submitted index to inspect child-sitemap status if counts remain zero; verify that the child XML URLs return actual entries before assuming a reporting delay.
- Live URL inspection and page indexing have not yet been confirmed. Repository tests use mocked data; they do not establish production indexing, DNS or Search Console access.
- `/panou/administrare` and `/administrare/proprietati/:id` send `noindex, nofollow`, are absent from sitemap discovery, and do not expose administrative data without the verified administrator role. Robots access is intentionally allowed so Google can read the exclusion tags; robots rules are not an access-control mechanism. Do not request indexing for administration or other private screens.

## Future pages

Future property listings need no manual SEO setup. Their real content supplies the metadata, and publishing includes their canonical URL in discovery. For a new kind of public route (for example a pricing page or a blog), add route-specific metadata and include it in the main sitemap; do not index private application screens. Keep metadata accurate and aligned with visible text. The requested "10x faster" wording is marketing copy supplied by the owner, not a performance result established by the SEO setup.

The homepage currently focuses on sign-in with a short service introduction. Broader search visibility will need useful public content about how the service works, its price and actual examples, alongside complete and distinctive property presentations. That is a separate content task requiring approved copy; this technical setup does not change the owner's visible wording or create placeholder marketing pages.

Google may rewrite search titles/descriptions, and sitemap submission does not guarantee indexing, a completion date, ranking or a rich result. RealEstateListing JSON-LD describes the page; no special Google real-estate rich result is promised.

If search still displays the former brand title or the generic globe, inspect the production homepage in Search Console after Vercel is Ready, test the live URL and request indexing once. This requests a recrawl; it does not force Google's displayed title or favicon, which can update separately. The configured homepage title is `Următoarea Proprietate - Prezintă Proprietatea Eficient` and its description is the owner's approved Romanian text.

## Validation

Run the targeted SEO, sitemap, sitemap-database, public-property-route and platform-admin tests; build and typecheck. `tests/connected/seo.spec.ts` verifies the existing login UI, structured data, signed-in redirect, anonymous administration-page noindex tags and authentication requirements on administration APIs against the CI build with mocked Supabase, not live accounts. The administrator browser suite also checks refusal of ordinary agent access. On 16 November 2026, the targeted unit suite passed 19 tests, the SEO/admin/property-sharing browser suite passed 12 tests, and the production build passed including TypeScript. Live Search Console, DNS, database activation and Vercel deployment must be verified separately.
