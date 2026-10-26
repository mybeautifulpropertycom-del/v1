# Original-photo property films

For the currently selected Higgsfield/MiniMax multi-photo generation, use [HIGGSFIELD-FILMS.md](HIGGSFIELD-FILMS.md).

This optional workflow animates **original photographs**, rather than generating new scene content with Hailuo. It preserves perspective, architecture, furnishings, visible surroundings and day/night conditions. It uses a controlled 2D camera crop, zoom and lateral movement; it does not reconstruct depth or pretend to fly through unseen space. Hailuo remains available in the separate single-clip workflow.

## Film specification

- Each selected photograph occupies exactly **102 frames at 30 fps = 3.4 seconds**, including its share of a six-frame cross-dissolve at scene boundaries. There are no extra title cards or closing screens. At most **23 distinct photographs = 78.2 seconds**, below the requested 80-second ceiling.
- The current property editor accepts up to 20 photos, so an ordinary current listing reaches at most 68 seconds. The 23-shot renderer cap also protects larger imported/future inputs; this change does not increase the editor's upload limit.
- The first shot is the strongest available exterior, otherwise a strong interior. The middle follows living/main rooms, dining/kitchen, bedrooms/bathrooms/other spaces and details. A different exterior ends the film when one exists; otherwise another memorable image closes it. A single exterior is never repeated just to create matching bookends. A one-photo listing produces one 3.4-second shot.
- A private OpenAI vision call classifies existing photos and their composition. It never generates or edits pixels. Invalid/incomplete analysis pauses processing rather than inventing a room type. Existing `OPENAI_API_KEY` and `OPENAI_PROPERTY_MODEL` are reused; this incurs normal OpenAI API usage. No agent contact information is sent. Only validated, owned Supabase photo URLs are accepted.
- Photographs with identical decoded, oriented pixels are deduplicated, including identical images saved under different filenames or lossless encodings. This is not a claim to identify every resized/retouched near-duplicate. If more than 23 unique photos are uploaded, selection reserves available room categories, then fills remaining places by composition strength. No photo is reused in the selected sequence.
- Version 2 uses faster arrivals/departures and a steady middle glide: 2.5–20% pushes/pulls and 16% lateral camera crops. Fractional rectangular coordinates with cubic 4:4:4 resampling replace integer zoompan crops, avoiding the visible stepping of the original renderer. All corners share the same scale; there is no perspective warp. Elevated drift is reserved for photographs that already show an aerial perspective. Portraits are letterboxed without stretching or generative fill. A slight camera crop is animated; the underlying photo is not geometrically warped or retouched.
- Six-frame cross-dissolves cross each musical scene boundary, without repeated dips to black. Each segment includes three incoming/outgoing handle frames from its immediate neighbor; these are transition overlaps, not repeated shots. The 102-frame/3.4-second slot remains exact. No morphing or invented room-to-room route is used, since photographs alone do not establish connectivity. Day remains day, and night photographs are used only if supplied.
- No voice, added captions, price, address, logo or slogan. Existing text/watermarks in the uploaded original are not removed or replaced. The visual sequence also works muted.
- The proposed soundtrack is an **original synthesized instrumental arrangement** implemented in `property-film-score.ts`: stereo struck keys, bass, a four-on-the-floor kick, clap, offbeat percussion, accents and short room reflections. It contains no imported samples, reference soundtrack or third-party recording. Eight beats fit every 3.4-second shot (141.176471 BPM), with bounded levels and a short ending fade at the film duration. This is a proposed house soundtrack, not a licensed commercial song selected from a library. FFmpeg's bundled package retains its own license notices; that software license is separate from the soundtrack.
- Output is **1280×720 H.264 MP4 with 48 kHz stereo AAC music**, optimized for browser playback, bounded to the existing 50 MiB storage limit.

## Install on the existing project

1. Run the entire [`supabase/sql-editor-property-films.sql`](../supabase/sql-editor-property-films.sql) after the already installed Higgsfield migration. Expect **`MBP_PROPERTY_FILMS_READY`**. It adds film progress fields, private intermediate storage and service-only rendering RPCs. It does not start generation, charge a customer, or alter existing completed films.
2. In Vercel **v1 → Environment Variables → Production**, add **`PROPERTY_VIDEO_MODE=photo-montage`** as Config. Keep **`HIGGSFIELD_ENABLED=false`** until the scheduler is installed. Existing `HF_KEY` and `HIGGSFIELD_MODEL=hailuo-2.3-standard` may stay saved; new original-photo jobs do not use them or spend Higgsfield credits. The existing server Supabase service key, site URL and OpenAI key remain necessary.
3. Generate a private worker secret. For example, in Supabase SQL Editor, run `select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as cron_secret;`. Copy the returned value directly into **`CRON_SECRET`** in Vercel as **Secret / Production**. Do not send it in chat. Use exactly the same value in the following scheduler call.
4. Run [`supabase/configure-higgsfield-scheduler.sql`](../supabase/configure-higgsfield-scheduler.sql). Expect **`MBP_HIGGSFIELD_SCHEDULER_READY`**. Then, separately, run:

   ```sql
   select public.configure_higgsfield_schedule(
     'https://www.mybeautifulproperty.com',
     'REPLACE_WITH_YOUR_CRON_SECRET'
   );
   ```

   Expect **`MBP_HIGGSFIELD_SCHEDULED`**. Keep one recurring scheduler. This uses Supabase Cron, pg_net and Vault; the scheduler name remains compatible with the existing video integration.
5. Set **`HIGGSFIELD_ENABLED=true`** and redeploy. The name is retained as the shared video-worker activation flag. This processes already queued **paid** properties, uses OpenAI for photo ordering, and consumes normal rendering/storage usage. It does not run a Hailuo generation for new jobs selected in `photo-montage` mode. Wait for Vercel Ready, then verify the first scheduler response and a complete film in the editor/public page.

No new paid video-provider account or separate rendering subscription is needed by this implementation. Hosting, database, storage, OpenAI usage and the production site's plan/terms still apply; this is not a claim of unlimited free capacity. The renderer targets Vercel's Node/Linux x64 runtime and includes its FFmpeg binary. Local non-Linux development can set a trusted absolute `PROPERTY_FILM_FFMPEG` path. Use `npm run higgsfield:check` to check configuration locally without a provider request; production settings are not visible to that local command.

## Recovery and delivery

The shared worker processes one durable step per invocation: plan, render **one** scene, or assemble all existing scenes. At a one-minute schedule, a listing with 10 selected photos normally needs roughly 12 scheduler invocations; a 23-shot film roughly 25, plus any delays or competing jobs. The user sees completed/total scene counts and may close the browser. This avoids trying to render a whole listing inside one request.

Each step holds a four-minute database lease. Progress is accepted only for the current paid order, attempt and lease; refunds/disputes/deletion block delivery. Interrupted local rendering resumes the saved plan and current shot, without new video-provider charges. Three consecutive step failures stop the job and expose the existing controlled retry action; each purchased package retains the existing three-attempt limit. A won dispute can resume the same saved film rather than starting over.

Shot MP4s live in the **private** `property-video-work` bucket. Only the final assembled film goes to `property-videos` and is linked to the page after atomic delivery. Cleanup of intermediate files is best effort after delivery. Cancelled/failed runs or interrupted cleanup may leave private intermediates for an operator retention cleanup; orphaned final uploads may also remain. As with the earlier public video implementation, an already known public Storage URL is not revoked merely by unpublishing the page.

The selected workflow is pinned in each in-progress job. Switching `PROPERTY_VIDEO_MODE` only chooses the workflow for new queued jobs; an existing Higgsfield request retains its original provider ID and is not converted or silently resubmitted. Do not rerun older SQL installers after this migration, because they contain earlier definitions of shared functions.

## Verification

`npm run film:preview` renders a local demonstration from the application's sample photos, without any API request, payment or publication. These sample photographs are not asserted to depict one verified property. An optional output filename may follow `--`. The preview uses the same motion, frame timing, soundtrack and final assembly as production.

Automated tests exercise actual packaged FFmpeg output (frame counts, codec, audio, duration and maximum length), ordering/deduplication, background recovery, private intermediates, paid access, stale leases and refund/dispute recovery. Local tests do not verify Vercel's live runtime, Supabase's hosted scheduler, or a real OpenAI vision call. Those require the first end-to-end production run after configuration.


## Cinematic version 2 and replacing an existing film

Deploy the updated application. New film plans use version 2 automatically; no new environment variables or provider keys are needed. Already running version-1 plans retain their renderer and soundtrack to avoid mixing incompatible clips. Completed films remain unchanged until explicitly rebuilt.

After the installed admin update, run all of [`supabase/sql-editor-cinematic-films.sql`](../supabase/sql-editor-cinematic-films.sql). Expect **MBP_CINEMATIC_FILMS_READY**. This adds an isolated generation ID and a protected rebuild operation; it does not start jobs or delete a film. Apply this upgrade after any older standalone installers.

In **Administration → Review property**, use **Rebuild video · No property fee** for a completed or failed original-photo film. This is limited to verified administrators and requires the active `photo-montage` worker and publication entitlement. It snapshots the current saved photographs, starts fresh analysis and rendering, and audits the action. A second concurrent rebuild is rejected. OpenAI analysis, hosting and storage usage still apply; no Stripe payment or Higgsfield generation is initiated.

The previous public film stays available while the replacement renders, and if the replacement fails. Delivery atomically replaces its URL when the complete new film is ready. Each rebuild has a new private storage namespace, so an old worker cannot overwrite new intermediate shots. New rendering leases also fence stale completions. Ordinary agents retain their existing retry limits; a rebuild is an explicit admin action, not an automatic unlimited retry.

The preview command renders a local proposed design/music sample from demo assets. Those photos are not represented as one verified property. Listen to the proposed house soundtrack before choosing it as the final creative direction; its original synthesis avoids third-party recording licenses but does not substitute for a professionally selected music-library recording.
