# Photo-based property stories

The Heritage uses each listing's own facts for its headings and introductions even
before AI is enabled. Its amenity ribbon loops **only the saved amenities** (or
listing facts when no amenities exist), with no SVG icons. It can be paused and
becomes a static wrapping list when reduced motion is preferred.

Optional OpenAI integration analyzes all saved photographs and proposes an English
description, seventeen section headings/introductions, and one caption per photo.
The description appears in all three designs; the additional headings/captions are
currently used by The Heritage. Other designs keep their existing section layouts.

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
   `store: false`, low-detail image input, a 5,000-output-token cap, and a 45-second
   timeout. Charges depend on image count, model, and output; set API project
   budgets/alerts as appropriate. Limits/alerts in the provider dashboard may not
   be hard spending caps.
4. In a real signed-in agent account, save a property and its uploaded photos.
   In **Property details** or **Photography**, select **Create my property story**.
   Review/edit the description, headings, and captions, then select **Use this
   story** and **Save changes**. Saving a published listing updates its live page.

Generation does not save or publish. Discarding a suggestion leaves the property
untouched. Editing a listing's facts or photo order invalidates previously saved
headings/captions; current factual copy takes over until a new story is generated.
The agent's saved description remains editable. A suggested story cannot be applied
if the listing changed while it was being generated or reviewed.

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
- Structured output is validated before review or rendering. Facts such as price,
  size, amenities, ownership, construction year, renovations and systems are not
  inferred or overwritten. The prompt limits visual descriptions to visible
  details and excludes discriminatory housing language. Model output still needs
  agent review; no automated verification of factual accuracy is claimed.
- No OpenAI key or extra schema is required for normal manual editing/publishing.
  Until activation, generation reports that it is unavailable. The demo never
  sends photos and never simulates a successful AI result.

Tests cover owner isolation, daily budget/cooldown/reset, repeated additive SQL,
image URL restrictions, request authentication, malformed/refused model output,
no-save generation, reviewed copy persistence, and stale-copy fallback. Provider
HTTP is mocked in tests: no paid OpenAI request or live schema migration has been
performed as part of this change. Complete a real photo-generation smoke test
after configuration before offering this feature to customers.
