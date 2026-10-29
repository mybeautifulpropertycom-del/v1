# Cinematic walkthrough direction

New BytePlus montage plans use `style: cinematic-walkthrough-v3`. The style is saved with each plan, so existing or partially generated films retain their original direction, soundtrack and edit behavior. No database migration or environment-variable change is required.

- Wide push: a controlled forward dolly from the photo's original composition, with straight architectural lines and no invented ultra-wide distortion.
- FPV accents: short forward/lateral glides in principal rooms or exterior views. Ground-level photographs remain ground-level; elevated flight language is used only for photographs classified as aerial. No banking, dives, window/door fly-throughs or inferred connections between rooms.
- Details, bathrooms and bedrooms receive restrained gimbal movement. Existing exterior-first/last selection, deduplication, day/evening preservation and room coverage remain in effect.
- Selected transitions between principal views use a six-frame directional whip on either side of the edit. Five-percent overscan covers the moving edges; horizontal motion blur fades away in the middle of the shot. Detail cuts remain soft. These are visible editorial transitions, not representations of physical travel between rooms.
- A monotone speed ramp preserves the generated movement and accelerates the edges. It does not reverse footage or generate extra provider seconds.
- The original synthesized stereo instrumental runs at 120 BPM. Integer-length 2–5 second scene boundaries fall on beats; percussion accents and restrained air sweeps reinforce cuts without restarting the score. No voice, provider audio, third-party recordings, prices, logos or slogans are added. Musical taste and the quality of the provider's generated geometry still need to be judged on a real completed property film.

Shot count, source durations, generation budget and global queue limits are unchanged. The new direction is chosen only when planning a new film. An existing completed film changes only through the usual explicit rebuild flow, which consumes provider credits; deploying this update does not rebuild films.

Local tests use synthetic moving footage with packaged FFmpeg to verify 720p output, exact frame counts/duration, stereo sound, bounded peaks and no black frames at speed transitions. These checks do not purchase Seedance generations or certify the visual fidelity of an unreviewed provider output.
