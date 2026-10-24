# My Beautiful Property

A first working edition of a real estate SaaS for the US market. English UI, USD and square feet by default, three property website designs, and a Supabase integration prepared for real accounts.

## Run locally

Requires Node.js 24 (also selected for Vercel and CI).

```bash
npm ci --cache /tmp/mbp-npm-cache
npm run dev
```

The app uses port 3000. Without Supabase configuration it runs in clearly labeled **demo mode**. Sample properties and agent details are fictional. Demo edits and uploaded photos persist in IndexedDB in the same browser and origin. They are not publicly shared or synced between devices.

## What works

- Responsive agent dashboard with search, filters, sorting, and list/grid views.
- Agent contact profile reused across every property design.
- Property creation and editing: headline, location, price/currency, area/unit, bedrooms, bathrooms, description, and amenities.
- Photo upload, browser-side WebP compression, cover selection, and gallery management. Up to 20 photos, 10 MB per input file.
- Three distinct responsive websites: **The Editorial**, **The Minimal**, and **The Panorama**.
- Direct on-page editing of the headline, location, and description, with explicit saving.
- Drafts, saved previews, publication validation, unpublishing, and stable public URLs.
- Supabase email/password signup, login, email confirmation, and password reset when configured.
- Public contact forms and a private agent inbox when configured. Replies use the agent’s email/phone app; automatic notification emails are not implemented.
- Public property metadata for social sharing, generated only for published properties.

The video studio is explicitly a planned feature. No Higgsfield service, video generation, editor, billing, or subscription enforcement is connected.

## Connect Supabase

For the step-by-step Romanian connection guide, see [CONNECT-SUPABASE.md](docs/CONNECT-SUPABASE.md). The Free plan is suitable for the current prototype; a Pro subscription is not required to connect it.

1. Create a Supabase project, preferably in a region close to the intended US customers.
2. Run the entire [`supabase/sql-editor-setup.sql`](supabase/sql-editor-setup.sql) once in a new project's SQL editor. It wraps the initial migration in a transaction, creates profiles, properties, inquiries, row-level security, public RPCs, signup triggers, and the `property-images` storage bucket, then returns `MBP_SETUP_OK`. A conflict rolls back the attempt; inspect existing objects instead of deleting them. Regenerate this file with `npm run supabase:prepare-sql` after editing the source migration. Alternatively, apply `supabase/migrations/202610230001_initial.sql` through your existing Supabase migration workflow. Use one installation method, and reconcile CLI migration history if switching from manual installation later. The ChatGPT Supabase plugin is optional.
3. Copy `.env.example` to `.env.local` and supply:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   Use the **public anon/publishable key**, never a service-role or secret key. Access control lives in PostgreSQL RLS. No service-role key is needed by this app.

4. In Supabase Auth, enable email/password accounts and email confirmation. Set your Site URL and add exact redirect URLs for `/dashboard/profile` and `/reset-password` on development and production origins. Configure a production SMTP provider before inviting customers; Supabase’s default test email service is limited.
5. Restart the dev server. For a production deployment, configure the variables **before building**: `NEXT_PUBLIC_*` values are embedded at build time.
6. Create an account, confirm its email, complete the contact profile, add a property, and publish it. Verify the public link in a separate signed-out browser. Submit a contact inquiry and check the agent’s inbox.

Run `npm run supabase:check` for read-only connection and anonymous-access diagnostics before the live workflow test. It prints no keys and does not create records. Missing configuration exits with code 2; failed remote checks exit with code 1. In a Node 24 environment using an HTTP/HTTPS proxy, run `NODE_USE_ENV_PROXY=1 npm run supabase:check`.

The current Supabase project has been installed through SQL Editor. Live read-only checks passed for Auth availability, the public property RPC, anonymous table-access denial, invalid inquiry rejection, and public storage bucket availability. Connected browser checks passed for the signed-out login redirect and rejection of an unknown public listing and inquiry. See [CONNECT-SUPABASE.md](docs/CONNECT-SUPABASE.md) for the current state; do not reapply the initial setup to this project.

The migration is also tested using real PostgreSQL semantics via PGlite with minimal Supabase schema stubs, including rollback on installation conflicts. Actual account signup/login, email delivery, authenticated photo uploads, cross-account isolation on the live project, and deployment have **not** yet been validated. Demo records do not migrate into a real account.

Marketing photos use a public bucket: anyone with an image URL can view it, including a draft listing’s photos. Property records, account details, and inquiries remain private. Only published property/contact data is exposed by `get_public_property`. Do not upload identity documents or other private files. Removed photos are detached from the listing; storage garbage collection is a future maintenance task.

## One domain, every property

```text
mybeautifulproperty.com/dashboard       Agent workspace
mybeautifulproperty.com/p/<stable-slug> Public property website
```

All pages are routes inside one application. Agents do not need separate domains, hosting plans, or DNS records. Each agent owns multiple listings; each listing chooses a design while retaining a stable, globally unique URL. Updating an agent’s contact profile is reflected immediately in public pages because the publication RPC joins the current profile.

Follow [DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) for the first deployment, Auth redirects, and domain connection. `vercel.json` selects Next.js and `npm run build:vercel`, which rejects missing public Supabase configuration and privileged key types before bundling. Local demo builds still use `npm run build`. Set the two Supabase variables in Vercel before deploying; an initial `vercel.app` address works before connecting the custom domain.

Add `mybeautifulproperty.com` in the host’s domain settings and enter the exact DNS records shown there at your registrar. Configure the production Auth redirects and rebuild after changing public environment variables. The host provisions TLS after domain verification. An optional `www` domain can redirect to the primary domain.

No deployment or DNS modification has been performed. Publishing a Codex development-environment snapshot is separate from deploying this website.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser suite tests the **unconfigured demo build**, using a fresh browser context per test. Leave the Supabase variables unset for that suite. It starts the production app on port 3001 if needed. On machines without Chromium, run `npx playwright install chromium`; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed browser. The cloud workspace uses `/usr/bin/chromium`.

Unit/database tests cover publication validation, US defaults, contact validation, cross-account isolation, public draft protection, ownership protection, contact synchronization, inquiry limits, unpublishing, and storage permissions. Browser tests cover creation, uploads, save/reload, editing, publication, templates, forms, navigation, and mobile layout.

Deployment checks also reject absent configuration, privileged keys, and invalid hosted origins without logging credential values. GitHub Actions runs the unit/database checks and demo browser suite without connecting to the live Supabase database.

## Structure and next steps

- `src/app`: Next.js routes, public server-rendered property pages, inquiry API.
- `src/components`: dashboard, editor, auth, profile, inbox, and three website designs.
- `src/lib`: data model, demo persistence, Supabase clients, and validation.
- `src/i18n`: US locale configuration and the initial English editor/profile dictionary. English is the only active locale; a future language rollout must extract the remaining page copy into dictionaries and add locale selection/routing.
- `supabase/migrations`: database and storage policies.
- `docs/PRODUCT-PLAN.md`: product stages, indicative costs, and video integration recommendations.
- `docs/ASSETS.md`: sample photography provenance.

Before a commercial launch, connect and validate Supabase Auth/Storage/SMTP on a staging deployment, add payment/subscription enforcement, strengthen contact anti-spam with a challenge and edge rate limiting, and publish the actual product’s privacy/terms pages. The current contact endpoint validates payloads, includes a honeypot, and enforces three messages per property/email per hour in PostgreSQL; it is not a complete anti-abuse system.

For future cloud tasks, use this existing isolated checkout. Do not create a Git worktree unless the user explicitly requests one.
