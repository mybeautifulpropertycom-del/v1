# Multi-photo Higgsfield / MiniMax property films

This workflow sends **one request per selected photograph** to Higgsfield's MiniMax Hailuo 2.3 Standard image-to-video endpoint. It assembles the generated moving footage into the property's full presentation film. It is different from both the original-photo animation renderer and the earlier first-photo/single-clip Higgsfield flow.

## Activate the existing installation

1. Deploy the updated `main` and wait for Vercel **Ready**.
2. In Supabase SQL Editor run **all** of [`supabase/sql-editor-higgsfield-films.sql`](../supabase/sql-editor-higgsfield-films.sql). Expect **MBP_HIGGSFIELD_FILMS_READY**. This combined upgrade requires the previously installed admin and film migrations. It includes the cinematic/rebuild upgrade; there is no need to run that file separately. It creates protected scene records and functions; it does not submit generations or remove a published film.
3. In Vercel → v1 → Environment Variables → Production, **edit** these existing Config values:

   | Variable | Value |
   | --- | --- |
   | `PROPERTY_VIDEO_MODE` | `higgsfield-montage` |
   | `HIGGSFIELD_MODEL` | `hailuo-2.3-standard` |
   | `HIGGSFIELD_ENABLED` | `true` |

   Keep the existing private `HF_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, public Supabase settings and site URL. No Higgsfield key belongs in a `NEXT_PUBLIC_` variable. The existing Supabase scheduler remains in use. The API account must have usable Higgsfield API credit; web-app subscription credits are not assumed to be interchangeable.
4. Redeploy and wait for **Ready**. Existing completed films do not change just because the mode changed. In **Administration → Review property**, click **Rebuild video · Uses API credits** for the property to replace. This explicitly starts fresh provider generations using its current saved photographs. It does not collect another $97 payment. The current film remains public until its replacement is complete.

New paid or admin-granted publications use the selected mode. In-progress jobs retain their pinned mode/profile. Do not rerun older standalone installers afterward because they replace shared functions with earlier versions.

## Content and edit specification

- Existing OpenAI image analysis selects/order/deduplicates photos: strongest exterior (otherwise interior), living, dining/kitchen, bedrooms/bathrooms/other rooms, details, distinct exterior or other memorable ending. No image is repeated to force two exterior bookends. Up to 23 scenes; the current 20-photo editor therefore produces at most 68 seconds.
- Each selected image gets a separate Hailuo request with `duration: 6`, its own `image_url`, and `prompt_optimizer: false`. Model profiles remain configurable. This workflow requires a video output, a reference to the selected image, and a numeric `duration` between 3.6 and 15 seconds for normalization. Alternative model profiles must meet those constraints.
- Shot-specific prompts request stable gimbal pushes, pull-backs or lateral glides. Elevated movement is requested only for photos classified as already aerial. Prompts forbid changes to architecture, geometry, furniture, views, lighting or room connections, and prohibit added voice/text/logo/price/address. **Generative video can still alter details; these prompts cannot guarantee exact photographic fidelity.** Review the first actual provider film for suitability.
- Generated footage is downloaded from authenticated status responses and stored privately after validation. Provider sound is discarded. FFmpeg maps the six seconds onto 3.6 seconds with faster entry/exit and a steadier middle. Three-frame transition handles on each end produce an exact **102-frame / 3.4-second** final scene slot, with a six-frame cross-dissolve across boundaries. No repeated black dips or invented room-to-room route.
- The final output is 1280×720 H.264 MP4 with 48 kHz stereo AAC, at most **78.2 seconds**, below 80 seconds. There is no title card, watermark, address, price, voice or added logo. Original photo watermarks are not automatically removed. The film works muted.
- The proposed modern instrumental house score is composed/synthesized in the app from original code, with keys, bass, drums and stereo ambience. Eight beats fit each shot (141.176471 BPM). No reference recording or third-party music samples are used. This is a proposed original soundtrack, not a claim of a professionally selected music-library track.

## Credits, durability and recovery

A film with N selected photos submits N provider generations. Six-second generation costs apply even though each scene occupies 3.4 seconds in the final edit. Credit conversion/pricing and available balance come from the user's Higgsfield API dashboard; the application does not infer the value of a reported credit balance. OpenAI analysis, hosting and storage usage are separate. A deliberate admin rebuild starts a new generation and consumes new API credits.

Before every billable POST, a transaction reserves the scene under the property's active lease and entitlement. Each scene stores its model/input and provider request ID. Known requests are polled and reused after download/render/storage failures; those failures do not automatically purchase another generation. Credits/auth/input rejections stop the job. An ambiguous POST timeout or lost request-ID save enters **uncertain** and is never automatically resubmitted. A signed per-generation/per-scene callback can recover the original request ID after authenticated API verification. Without such a callback, reconcile the request in the provider dashboard; do not create another request merely to clear the error.

Each worker invocation performs bounded work. Provider rendering is asynchronous; callbacks and the existing minute scheduler resume it. A few quick planning/editing steps may share an invocation. Timing depends on provider queue, photo count and other jobs; there is no promise of instant generation.

The database verifies actual payment or a protected complimentary grant at claim, reservation, callback binding and checkpoint. Refund/deletion blocks future work/delivery, although an already submitted provider request may already consume credits. Scene progress and model selection are pinned. Private clips use a unique generation namespace; stale workers cannot overwrite a replacement's scenes. The final public URL changes only after the whole film is delivered. Existing public Storage URLs remain accessible to anyone who already has them.

A transient local-processing failure can use the ordinary retry action to resume the **same** known requests/scenes with a bounded retry count. Provider-rejected or ambiguous requests require review. Admin rebuilding is available only when no job is active; it keeps prior public footage while preparing the replacement and writes an audit entry. Previous provider scene records are retained for reconciliation.

## Validation boundaries

Automated tests use real PostgreSQL semantics and packaged FFmpeg, and mocked provider responses. They cover per-photo submissions, ambiguous POST recovery, nonduplicating retries, eligibility/revocation, leases, duration, transition continuity, actual moving-footage editing and protected rebuild controls. Local checks do not prove production API credit availability, model output quality, delivery to the live webhook or scheduler execution. The first live rebuild verifies those. The earlier `property-film-cinematic-v2.mp4` sample is a photo-animation demo, **not** a MiniMax generation.
