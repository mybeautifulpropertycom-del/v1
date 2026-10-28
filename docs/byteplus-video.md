# Direct BytePlus ModelArk property films

New cinematic walkthroughs can use BytePlus directly with `dreamina-seedance-2-5-260628`. No Higgsfield request is made for a BytePlus film. Published pages, payments, admin complimentary publication, photo ordering, original instrumental music and durable storage retain the existing workflow. New BytePlus films use variable 2–5-second scenes, at most 23 scenes and 80 seconds total. Existing Higgsfield/photo-only films keep their saved 3.4-second timeline.

## Activate in Vercel

If a key has been shared in chat or a screenshot, revoke it in BytePlus and create a replacement. Put only the replacement in Vercel → v1 → Settings → Environment Variables → Production:

| Variable | Value | Type |
| --- | --- | --- |
| `ARK_API_KEY` | New BytePlus API key with access to the activated model | Secret |
| `BYTEPLUS_VIDEO_MODEL` | `dreamina-seedance-2-5-260628` | Config |
| `PROPERTY_VIDEO_MODE` | `byteplus-montage` | Config |
| `PROPERTY_VIDEO_ENABLED` | Keep `false` until the tariff below is verified; then `true` | Config |
| `BYTEPLUS_VIDEO_USD_PER_SECOND` | Verified conservative USD cost per generated second for this model, 720p, one input photo, no audio | Config |
| `PROPERTY_VIDEO_MAX_COST_USD` | `20` (may be lowered, never above 20; unset defaults to 15) | Config |
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
- Each planned shot requests its own integer duration (2, 3, 4 or 5 seconds), at 720p, 16:9, `generate_audio: false`, `watermark: false`. There is no uniform six-second generation. A three-second scene requests three seconds. The editor applies the existing speed ramp and transitions while preserving that scene's final length. Source and final durations are included in the budget.
- The specific model must accept these short durations. Their availability has not been verified with a live account. A rejection stops the film; the application never automatically retries at a longer, more expensive duration. The returned duration (and resolution when supplied) must match the request, otherwise subsequent generation stops for review. This cannot undo the cost of a provider request already accepted.
- One continuous modern instrumental score is assembled locally across the film, using the existing melody, tempo and instrumentation. Subtle percussion accents follow scene boundaries; no voice or separate generated music is requested for each scene.
- Only the model ID is changed by `BYTEPLUS_VIDEO_MODEL`. Another model must support these input parameters; changing an ID does not make incompatible input formats interchangeable.
- No reference advertisement, sample audio, example video or voice prompt from the documentation is sent.

The task retrieval contract and nested image format were checked against the official Ark SDK at commit `db6f22be1e404e58bfe55a1c8153f26fbf96a510`:
- https://github.com/volcengine/volcengine-python-sdk/blob/db6f22be1e404e58bfe55a1c8153f26fbf96a510/volcenginesdkarkruntime/resources/content_generation/tasks.py
- https://github.com/volcengine/volcengine-python-sdk/blob/db6f22be1e404e58bfe55a1c8153f26fbf96a510/volcenginesdkarkruntime/types/content_generation/content_generation_task.py

## Recovery and validation

Scene reservation happens before a billable POST. A timeout, malformed response, 5xx, or failed database acknowledgement after submission is uncertain: no automatic second POST. The administrator must reconcile that task using the BytePlus task ID and existing protected binding workflow. This integration uses polling, not BytePlus callbacks. Poll/download/edit retries reuse saved task IDs and clips. Uncertain jobs do not automatically recover from a provider callback.

The job and scene profiles select the provider on every resume, regardless of later environment changes. Missing credentials defer jobs before reservation. Non-success response bodies and credentials are not logged. Media downloads use the existing public-IP validation and do not carry the API key.

Automated tests mock provider calls and verify request shape, status mapping, provider snapshots, no duplicate submission on ambiguous failures, durable resume and worker switches. They do not verify the real account's model access, balance, video quality or delivery. After configuration, generate one small property film (for example 2–3 photographs) from the admin workflow, check its task in ModelArk, and verify the final video on the property page before scaling up. This is a real billable generation.


## Adaptive length and estimated budget

The walkthrough uses the strongest unique images rather than every uploaded photo. With sufficient budget, 15 unique images select up to 11 scenes targeting 30 seconds, 30 select up to 21 targeting 60 seconds, and 40 select up to 23 targeting 80 seconds. Scenes vary from 2 to 5 seconds: longer opening/closing and main-room shots, quicker detail cuts. Fewer unique images, duplicates or a tighter budget produce shorter films. Opening/closing exterior photographs are retained when at least two distinct exteriors and two scene slots are available. Middle selections prioritize room coverage and then quality. The speed ramps and transitions retain their existing design and adapt their frame counts to the scene lengths; the score remains continuous.

`BYTEPLUS_VIDEO_USD_PER_SECOND` has **no default**. Until a verified rate is entered, BytePlus jobs are deferred before claiming/planning, including before paid photo analysis. If the provider displays token pricing, obtain its calculator estimate or documented conservative conversion for these exact inputs; do not paste a $/token number into a $/second setting. No real tariff is inferred from a competitor comparison or the development test fixtures.

The application permits at most a $20 planning budget and reserves 20%: with $20 configured, generation must fit within $16, with $4 left outside it. Existing deployments with $15 configured retain their $12 generation estimate plus $3 reserve. Increasing the cap does not lengthen short-property plans just to spend the budget. At an estimated $0.28 per generated second, a 30-second film is approximately $8.40 before conservative per-scene rounding; larger films fit roughly 55–57 seconds under the $16 generation estimate. Each scene is costed at its actual requested 2–5 seconds and rounded up to cents; a short scene no longer purchases six seconds. Selection is reduced to fit the estimate rather than filling a promised runtime. This is **not a provider-enforced invoice cap**. Incorrect/stale prices, input-token charges, taxes or other account fees can affect the bill; the reserve is not a guarantee that they fit. The estimate covers one film generation, not cumulative manual rebuilds; each explicit rebuild can incur another charge. Infrastructure and OpenAI costs are not independently metered by this guard.

The estimate and tariff are snapshotted in the film plan, checked against the current configured budget before every scene reservation, and shown to the administrator with generated and final seconds. A price increase or lower budget that makes the plan unaffordable pauses the normal worker before a new scene. Legacy BytePlus plans without a matching variable-timing budget record require review; they are not silently grandfathered into paid requests. Already-generated clips can still be assembled without requesting new scenes.

Before enabling production generation, verify the tariff and evaluate one small real film. The automated checks verify selection, accounting and duplicate prevention, not subjective quality or actual provider charges.
