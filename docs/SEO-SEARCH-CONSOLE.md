# SEO and Google Search Console

## What the application does

- `/` serves the existing sign-in experience as HTML with HTTP 200, the requested title and description, a canonical URL, Open Graph/Twitter metadata, and WebSite JSON-LD. A valid signed-in session still redirects to `/dashboard` in the browser. `/login` uses the same metadata and canonicals to `/`.
- Each **published** property automatically gets a title based on its headline/location, a description from its current description, its current canonical address URL, cover-image sharing metadata, and RealEstateListing JSON-LD. This applies to all three designs and future properties. Old URLs continue using the existing redirects. Unpublished/missing properties return 404 with noindex.
- Dashboard/admin screens, previews, template samples, registration and password-reset pages remain noindex. Robots permits fetching their noindex tags and application assets; API routes are disallowed. Vercel preview deployments opt out of indexing.
- `/sitemap.xml` is a sitemap index. `/sitemap.xml/main.xml` contains the homepage. Property sitemaps contain up to 1,000 current published URLs each. New publications, edits and unpublishing are reflected automatically; Vercel caches XML for up to five minutes. Dates come from database updates, not the request clock. Drafts, old URL aliases, private contact data and demo listings are excluded.
- Database failures return a temporary 503, rather than a misleading empty property sitemap.

## Activate on the existing installation

1. Run the entire **`supabase/sql-editor-public-sitemap.sql`** in the existing project's Supabase SQL Editor. It is an additive, repeatable update: an index and a read-only RPC. It does not alter existing listings or table RLS. Expect `MBP_PUBLIC_SITEMAP_READY`. Do not rerun the full first-installation SQL on an existing project.
2. In Vercel Production, ensure `NEXT_PUBLIC_SITE_URL` equals the primary HTTPS domain (without a path). The existing canonical default is `https://www.mybeautifulproperty.com`. If the primary domain is the apex instead, use `https://mybeautifulproperty.com`. The secondary hostname should redirect to the primary in Vercel's domain settings. Rebuild after changes. Existing public Supabase configuration is reused; no new credential or service-role key is needed for sitemap discovery.
3. Deploy `main`. Verify `/`, `/robots.txt`, `/sitemap.xml`, `/sitemap.xml/main.xml` and a published property URL on the real domain. Check that canonical URLs match the primary hostname and the XML contains actual published listings. An XML 503 usually means the RPC upgrade or the database connection still needs attention.
4. The owner has already reported **Ownership verified** in Search Console. Keep the verification CNAME. In that verified property's **Sitemaps**, submit the full primary-domain URL ending in `/sitemap.xml`. Google discovers the child sitemaps automatically; you do not submit a new sitemap for each future listing.
5. In **URL inspection**, inspect the homepage and one public property, run **Test live URL**, then **Request indexing** if available. Monitor **Page indexing**, **Sitemaps**, **HTTPS** and **Core Web Vitals**. Search Console access and sitemap submission are separate from repository deployment.

## Future pages

Future property listings need no manual SEO setup. Their real content supplies the metadata, and publishing includes their canonical URL in discovery. For a new kind of public route (for example a pricing page or a blog), add route-specific metadata and include it in the main sitemap; do not index private application screens. Keep metadata accurate and aligned with visible text. The requested "10x faster" wording is marketing copy supplied by the owner, not a performance result established by the SEO setup.

Google may rewrite search titles/descriptions, and sitemap submission does not guarantee indexing, a completion date, ranking or a rich result. RealEstateListing JSON-LD describes the page; no special Google real-estate rich result is promised.

## Validation

Run the targeted SEO, sitemap, sitemap-database and public-property-route tests; build and typecheck. `tests/connected/seo.spec.ts` verifies the existing login UI and the signed-in redirect against the CI build with mocked Supabase, not live accounts. Live Search Console, DNS, database activation and Vercel deployment must be verified separately.
