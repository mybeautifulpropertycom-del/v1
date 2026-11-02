# Cinematic walkthrough direction

## Per-film music

New plans now also save a `soundtrack` descriptor (`property-score-v1`) inside the existing plan JSON. The composition seed uses the film generation identifier and selected photographs/observations, so different generations receive different compositions even with the same photographs. Retries reuse the saved descriptor; existing plans without it keep their original score. No SQL migration, new credentials or external music service is needed.

Visible dusk/evening scenes select a restrained minor-key arrangement. Films dominated by bedrooms/details or longer shots select a warmer, spacious arrangement. Other films use a brighter instrumental. The choice is based on the existing photo analysis and actual edit timing, not an inferred property price or location. Energy is reduced around quiet rooms and evening scenes and increased for aerial/FPV views.

Each composition varies key, diatonic chord progression, melodic phrases/rests, tempo, key timbre and syncopation. Tempo ranges are 88–104 BPM for evening, 96–112 for warm and 112–128 for bright arrangements. The music remains continuous across scenes, with accents at the actual cuts and a final fade. It is original synthesized instrumental audio, with no vocals, third-party recordings or BytePlus scene audio. The match is rule-based; it is not an analysis of the finished provider footage or a promise about musical taste.

This applies to new BytePlus plans and the shared generated/photo montage workers. Completed films and saved in-progress plans are not changed by deployment. The normal explicit rebuild creates a new generation and soundtrack, and may consume video-provider credits; this change does not automatically rebuild anything or purchase extra scene generations.

Tests cover audio reproducibility, audible low-frequency differences between generations, stereo, duration, bounded levels/fades, context selection, persistence across worker retries, legacy compatibility and real FFmpeg MP4 assembly.

## Existing cinematic direction

New BytePlus montage plans use `style: cinematic-walkthrough-v3`. The style is saved with each plan, so existing or partially generated films retain their original direction, soundtrack and edit behavior. No database migration or environment-variable change is required.

- Wide push: a controlled forward dolly from the photo's original composition, with straight architectural lines and no invented ultra-wide distortion.
- FPV accents: short forward/lateral glides in principal rooms or exterior views. Ground-level photographs remain ground-level; elevated flight language is used only for photographs classified as aerial. No banking, dives, window/door fly-throughs or inferred connections between rooms.
- Details, bathrooms and bedrooms receive restrained gimbal movement. Existing exterior-first/last selection, deduplication, day/evening preservation and room coverage remain in effect.
- Selected transitions between principal views use a six-frame directional whip on either side of the edit. Five-percent overscan covers the moving edges; horizontal motion blur fades away in the middle of the shot. Detail cuts remain soft. These are visible editorial transitions, not representations of physical travel between rooms.
- A monotone speed ramp preserves the generated movement and accelerates the edges. It does not reverse footage or generate extra provider seconds.
- Plans without the new soundtrack descriptor retain the original synthesized stereo instrumental at 120 BPM. Integer-length 2–5 second scene boundaries fall on beats; percussion accents and restrained air sweeps reinforce cuts without restarting the score. No voice, provider audio, third-party recordings, prices, logos or slogans are added. Musical taste and the quality of the provider's generated geometry still need to be judged on a real completed property film.

Shot count, source durations, generation budget and global queue limits are unchanged. The new direction is chosen only when planning a new film. An existing completed film changes only through the usual explicit rebuild flow, which consumes provider credits; deploying this update does not rebuild films.

Local tests use synthetic moving footage with packaged FFmpeg to verify 720p output, exact frame counts/duration, stereo sound, bounded peaks and no black frames at speed transitions. These checks do not purchase Seedance generations or certify the visual fidelity of an unreviewed provider output.

## Motion cadence

New plans also save `renderVersion: smooth-v1`. This changes only frame sampling inside each generated scene. The existing speed curve, shot lengths, 30fps delivery, six-frame edit handles, transitions, camera prompts and soundtrack are unchanged. Previously saved plans without this field retain their original processing on resume; deploying does not regenerate or modify completed films.

The legacy `fps=30` conversion repeats frames when retimed source footage slows down. The new pass uses motion-compensated interpolation at 30fps on each individual scene before editing. It never interpolates across a room transition. Motion estimation is limited to at most 720p, with bounded search and scene-change detection. Source duration is checked before adding look-ahead padding, and the exact output frame count is checked afterward. The normalization timeout is 90 seconds; no additional provider requests or generated seconds are introduced, but local rendering adds CPU time.

Regression tests decode pixels from 24fps and 30fps synthetic moving sources to measure held frames before and after processing, reject truncated sources, and verify exact duration through the existing transition/assembly pipeline. Interpolation addresses sampling judder; it cannot guarantee removal of camera shake, deformations or other defects already generated by the provider. Review architectural edges in a real new film before judging final visual quality.
