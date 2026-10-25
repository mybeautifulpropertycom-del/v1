# Higgsfield API setup

The official `@higgsfield/client` SDK is installed. The server client is prepared in `src/lib/higgsfield-server.ts`. This is credential preparation, **not an active video generation integration**. Existing paid video requests remain queued.

## Credentials

1. Open [Higgsfield Cloud](https://cloud.higgsfield.ai/) and sign in. Use its API credentials/key management screen to create a key pair. The [official SDK authentication guide](https://github.com/higgsfield-ai/higgsfield-js#authentication) documents an API Key ID and API Key Secret.
2. Vercel → project **v1** → Settings → Environment Variables → **Production**:

   | Name | Value | Type |
   | --- | --- | --- |
   | `HF_API_KEY` | API Key ID | Secret |
   | `HF_API_SECRET` | API Key Secret from the same key pair | Secret |

3. Save and redeploy. Do not prefix either name with `NEXT_PUBLIC_`. Do not send the values in chat or commit them to GitHub.

These variables are optional until generation is integrated. Their absence does not prevent the website or Stripe from deploying. Saving them alone does not spend credits or prove that the account has API access.

## What must be confirmed before connecting paid generation

Use the account's API model page to confirm the exact model ID, image input schema, duration/resolution options, generation price, and available API credit. Do not assume a consumer Higgsfield subscription includes the required API balance. The documentation website and API hosts could not be accessed from this workspace; the authentication and SDK installation were verified using the official package published on npm.

The SDK's generic image-to-video example is not evidence that a specific Seedance version is available to this account. Obtain the model's documented request example before implementing its adapter. Do not substitute a different model silently.

Generating clips from individual photos and assembling a complete property presentation are separate operations. Choose the supported multi-image workflow, or a clip generation plus rendering service, after inspecting the selected model. Agree on a bounded photo count and duration so a $97 property package has a predictable generation cost.

The delivery worker must claim the existing paid video job atomically, save provider request IDs, verify current paid access, reconcile ambiguous submissions without duplicate charges, process completion asynchronously, preserve the finished video in durable storage and expose it to the property page. Do not assume the provider honors an idempotency header unless its documentation confirms this. The prepared server client disables automatic submission retries.

No Higgsfield generation request or live credential verification has been performed by this setup change.
