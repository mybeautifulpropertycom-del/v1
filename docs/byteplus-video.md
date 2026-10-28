# Direct BytePlus ModelArk property films

New property films can use BytePlus directly with `dreamina-seedance-2-5-260628`. No Higgsfield request is made for a BytePlus film. Published pages, payments, admin complimentary publication, photo ordering, 3.4-second scenes, the 23-scene/78.2-second limit, original instrumental music and durable storage retain the existing workflow.

## Activate in Vercel

If a key has been shared in chat or a screenshot, revoke it in BytePlus and create a replacement. Put only the replacement in Vercel → v1 → Settings → Environment Variables → Production:

| Variable | Value | Type |
| --- | --- | --- |
| `ARK_API_KEY` | New BytePlus API key with access to the activated model | Secret |
| `BYTEPLUS_VIDEO_MODEL` | `dreamina-seedance-2-5-260628` | Config |
| `PROPERTY_VIDEO_MODE` | `byteplus-montage` | Config |
| `PROPERTY_VIDEO_ENABLED` | `true` | Config |
| `HIGGSFIELD_ENABLED` | `false` | Config |

Edit existing variables instead of adding duplicates. Redeploy the latest main commit and wait for Ready. Never use a NEXT_PUBLIC prefix for the API key.

Keep the existing `OPENAI_API_KEY` (photo analysis), `SUPABASE_SERVICE_ROLE_KEY`, public Supabase settings, `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET`. The existing `/api/video/worker` Supabase scheduler is reused. No new SQL migration is needed if the existing multi-photo Higgsfield film upgrade and scheduler are installed. The internal engine identifier remains `higgsfield-montage-v1` for database compatibility; the immutable `model_config.profile.provider = "byteplus"` selects the actual service. Scene rows also retain the profile.

`PROPERTY_VIDEO_ENABLED` controls the shared worker. When absent or blank it falls back to the old `HIGGSFIELD_ENABLED` behavior. With the shared worker enabled and Higgsfield disabled, existing Higgsfield jobs pause; they are never silently reissued to BytePlus. Existing completed videos remain public. Enabling BytePlus processes eligible queued jobs, including queued complimentary publications, and can incur API charges.

A completed or failed film can be rebuilt explicitly from the admin property screen. The rebuild uses the newly selected provider and preserves the old public film until its replacement is complete. Processing/uncertain jobs cannot be rebuilt without reconciling their existing requests. Do not erase their provider IDs to force a retry.

## API contract and settings

- Fixed regional endpoint from the user's ModelArk sample: `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`.
- Server-side Bearer authentication with `ARK_API_KEY`; redirects are refused.
- POST returns an `id`. GET the same path plus `/{id}` returns status and `content.video_url`.
- `queued` / `running` are polled by the existing scheduler; `succeeded` is downloaded, normalized and assembled; failed/cancelled/expired tasks stop that film.
- One original photograph per request in `content`, with `type: image_url`, nested `image_url.url`, and `role: reference_image`, plus the existing property cinematography prompt.
- Default generation: 6 seconds, 720p, 16:9, `generate_audio: false`, `watermark: false`. The editor adds music and trims each scene to 3.4 seconds. BytePlus bills generated output, not the shorter edited duration: a 23-scene film requests 23 × 6 = 138 seconds before editing. Actual pricing depends on the account, model and token usage; no per-film price is assumed.
- Only the model ID is changed by `BYTEPLUS_VIDEO_MODEL`. Another model must support these input parameters; changing an ID does not make incompatible input formats interchangeable.
- No reference advertisement, sample audio, example video or voice prompt from the documentation is sent.

The task retrieval contract and nested image format were checked against the official Ark SDK at commit `db6f22be1e404e58bfe55a1c8153f26fbf96a510`:
- https://github.com/volcengine/volcengine-python-sdk/blob/db6f22be1e404e58bfe55a1c8153f26fbf96a510/volcenginesdkarkruntime/resources/content_generation/tasks.py
- https://github.com/volcengine/volcengine-python-sdk/blob/db6f22be1e404e58bfe55a1c8153f26fbf96a510/volcenginesdkarkruntime/types/content_generation/content_generation_task.py

## Recovery and validation

Scene reservation happens before a billable POST. A timeout, malformed response, 5xx, or failed database acknowledgement after submission is uncertain: no automatic second POST. The administrator must reconcile that task using the BytePlus task ID and existing protected binding workflow. This integration uses polling, not BytePlus callbacks. Poll/download/edit retries reuse saved task IDs and clips. Uncertain jobs do not automatically recover from a provider callback.

The job and scene profiles select the provider on every resume, regardless of later environment changes. Missing credentials defer jobs before reservation. Non-success response bodies and credentials are not logged. Media downloads use the existing public-IP validation and do not carry the API key.

Automated tests mock provider calls and verify request shape, status mapping, provider snapshots, no duplicate submission on ambiguous failures, durable resume and worker switches. They do not verify the real account's model access, balance, video quality or delivery. After configuration, generate one small property film (for example 2–3 photographs) from the admin workflow, check its task in ModelArk, and verify the final video on the property page before scaling up. This is a real billable generation.
