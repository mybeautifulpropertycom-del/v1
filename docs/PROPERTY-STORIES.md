# Photo-based property stories

The Heritage uses each listing's own facts for its headings and introductions even
before AI is enabled. Its amenity ribbon loops **only the saved amenities** (or
listing facts when no amenities exist), with no SVG icons. It can be paused and
becomes a static wrapping list when reduced motion is preferred.

OpenAI analyzes the saved photographs and writes separate English paragraphs for
positions on the landing page. Each paragraph requests two short sentences. The
introduction uses the cover photo, the main story uses photo 2 (or the cover), the
features section uses photo 3 (or the last available photo), and gallery copy uses
all photographs. Editorial and Heritage use independent section text; Panorama uses
the main story paragraph. The page layouts and property facts remain unchanged.

There is no separate AI card, generation button, or review form. In a connected
workspace, **Save changes**, **Choose your design**, and **Publish website** prepare
missing or stale descriptions as part of saving. A valid saved result is reused,
including after changing only the template. Agent-entered description notes are
preserved. Generated main text is stored separately in `website_copy.description`;
only an empty description is initialized from the generated paragraph.

Opening a private preview of a property without current section copy also prepares
text, displayed directly in the page. This preview result is local until the agent
clicks **Save website**. Public visitor pages and sample templates never generate.
**Edit on page** allows independent edits to each displayed section. Saving an
already published listing updates its live website; merely previewing it does not.

## Activate on the existing deployment

1. In the existing Supabase project's **SQL Editor**, run the entire
   [`sql-editor-property-stories.sql`](../supabase/sql-editor-property-stories.sql).
   It should return `MBP_PROPERTY_STORIES_OK`. This is an additive, repeatable
   update. **Do not rerun `sql-editor-setup.sql` on an installed project.** No
   existing listing or profile data is replaced. For fresh installations, the
   generated full installer includes both migrations.
2. Create an OpenAI API project with API billing enabled. ChatGPT subscriptions
   do not include API usage. Add its key in **Vercel → v1 → Settings → Environment
   Variables** as `OPENAI_API_KEY` for Production. Never use a `NEXT_PUBLIC_`
   prefix and never paste the key into source control or chat.
3. Optionally set `OPENAI_PROPERTY_MODEL`; the default is `gpt-4.1-mini`, which
   supports image input and structured output. Use a model with those capabilities.
   Redeploy after changing variables. The server uses OpenAI's Responses API with
   `store: false`, low-detail image input, a 4,000-output-token cap, and a 45-second
   provider timeout within a 55-second request deadline. Charges depend on image count, model, and output; set API project
   budgets/alerts as appropriate. Limits/alerts in the provider dashboard may not
   be hard spending caps.
4. In a signed-in account, add property details/photos and click **Save changes**.
   Open **Preview** to review the separate paragraphs. Click **Edit on page**, change
   any highlighted text, then **Save website**. Publish when the page is ready.

No new SQL is needed for this automatic section-copy revision if the project already
returned `MBP_PROPERTY_STORIES_OK`. The existing JSONB column holds the main section
paragraph as well as the headings/introductions. Older copy remains readable and
is upgraded on the next preparation. Changed facts or photo order invalidate cached
copy. Results for an outdated input snapshot cannot be applied.

Generation errors leave the entered details/photos saved and never publish a draft.
The editor brings the error into view and offers manual continuation using the
agent's own text. Save again to retry automatic preparation; private preview has a
**Try again** action. The service has no automatic retry loop.

## Troubleshooting generation

Failures now carry a safe support code and request reference. The matching Vercel
log entry is `property_story_failed`; it contains only the code, reference, and
provider HTTP status, never API keys, auth tokens, image URLs or provider messages.

| Code | What to check |
| --- | --- |
| `AI_NOT_CONFIGURED` | `OPENAI_API_KEY` is missing from the running deployment. Enable it for Production and redeploy. This occurs before checking API credit. |
| `AI_CREDITS` | OpenAI API billing, available credit, and project limits. ChatGPT billing is separate. |
| `AI_AUTH` | The server-only `OPENAI_API_KEY` and the production redeployment. |
| `AI_MODEL` | Access to the configured Responses/image-capable model. |
| `AI_PHOTO` | Public accessibility and validity of the uploaded property photos. |
| `AI_REQUEST` | Request-format compatibility; share the reference with the developer. |
| `AI_TIMEOUT` / `AI_BUSY` | Wait briefly and retry. Entered details stay saved; no generated copy is applied. |
| `AI_OUTPUT` | The provider returned incomplete or invalid copy; retry. |
| `AI_UNAVAILABLE` | A temporary connection or service issue; retry later. |

Sign-in retrieval, upstream requests, and the client wait have deadlines. Non-JSON
platform timeout pages produce readable messages. Structured output uses the basic
object/string/array schema; paragraph lengths and caption counts are checked locally.

## Scope and safeguards

- The route verifies Supabase authentication, reads the listing using the agent's
  bearer token and RLS, and accepts only an owned property ID. Facts/images cannot
  be supplied or overridden in the HTTP request.
- Only photos in the configured Supabase bucket under that exact agent/property
  directory can be sent. Remote URLs, other owners' uploads, SVGs, query strings,
  credentials in URLs, and path traversal are rejected.
- Only property details and image URLs go to OpenAI. Agent name, phone, email,
  buyer inquiries, and auth tokens are not included. The editor explains the use
  of an AI writing service before generation.
- PostgreSQL serializes a durable budget of **five attempts per agent per UTC day**,
  with at least one minute between attempts. Failed provider calls still consume
  an attempt. The counter cannot be read/reset directly by clients. This MVP limit
  is not a billing/subscription system or a full defense against mass signups.
- Structured output is validated before saving or rendering. Facts such as price,
  size, amenities, ownership, construction year, renovations and systems are not
  inferred or overwritten. The prompt limits visual descriptions to visible
  details and excludes discriminatory housing language. Model output still needs
  agent review; no automated verification of factual accuracy is claimed.
- Manual continuation remains available when generation is unavailable. The demo never
  sends photos and never simulates a successful AI result.

Tests cover owner isolation, daily budget/cooldown/reset, repeated additive SQL,
image URL restrictions, request authentication, malformed/refused model output,
no-save generation, reviewed copy persistence, and stale-copy fallback. Provider
HTTP is mocked in tests. Connected browser tests also exercise the actual signed-in
editor path with intercepted Auth/Storage/database/AI responses: automatic saving,
separate paragraphs, cached copy reuse, independent inline edits, preview-only
generation, missing-key errors, network failures, and non-JSON platform timeouts. They run
with `npm run test:e2e:connected` after building with
`NEXT_PUBLIC_SUPABASE_URL=https://browser-test.supabase.co` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key` (test fixtures, never production).
No paid OpenAI request has been performed from this development environment.
Complete a real photo-generation smoke test on the deployment before offering this
feature to customers; a local mocked pass does not verify live API billing or credentials.
