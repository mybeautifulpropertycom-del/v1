# The Editorial

The English Editorial design follows the supplied reference screenshots: an
image-led hero, cream story section, forest-green scroll sequence, a photograph
alongside the property specifications, a separate complete gallery, film, agent
contact, and a final viewing invitation. The Minimal and Panorama remain available.

The residence title, description, location, price, dimensions, rooms, amenities,
and photographs come from the saved property. The agent's identity, brokerage,
biography, email, and phone come from the shared profile. Existing inline editing
and publication behavior are preserved. Sample photography remains covered by
the notes in [ASSETS.md](ASSETS.md).

## Photography

On larger screens, scrolling through the pinned dark section changes the featured
photo, caption, and progress indicator. Buttons also navigate the photos. On
smaller screens and with reduced motion enabled, the section has a normal height
and photos can be selected with its controls. The complete gallery is independent
and opens a keyboard-accessible lightbox.

## Viewing requests

The native dialog has English contact fields and a Sunday-first calendar. Past
days are unavailable and requests can be made up to one year ahead. Arrow keys
navigate calendar days, Escape closes the dialog, and focus returns to the trigger.

`POST /api/inquiries` accepts an optional `preferredDate` (`YYYY-MM-DD`). The server
validates it and formats the viewing request into the existing inquiry message.
The preferred day remains a date-only value; no appointment time is inferred.
The existing Supabase RPC routes it into the listing owner's private inbox, with
the same RLS and rate limits as ordinary inquiries. No database migration is needed.
The agent must confirm the time and availability; this does not create a calendar
event or send an email notification. Samples and saved previews never submit.

## Property film

`PropertyWebsite` accepts an optional `film` (`src`, optional `poster` and English
`captions`). A supplied film uses a native accessible video player. Contact follows
this section. Until a real film is supplied, a clearly labeled layout preview is
shown only in samples and saved previews. Published pages omit the empty section.

Higgsfield generation, finished-video storage, and passing the completed video URL
from the public-property loader are still to be connected. No automated video
generation or video persistence is implemented in this change.

## Verification

- `npm test`: model, inquiry validation, calendar date boundaries, and PostgreSQL
  checks for viewing-request persistence and owner isolation.
- `npm run build` and `npm run typecheck`.
- `npm run test:e2e` with a demo build: pinned photographs, independent gallery,
  reduced motion, mobile layout, calendar navigation, focus behavior, preview
  non-submission, inline editing, and shared profile updates across all designs.

The browser tests use empty Supabase environment variables. Rebuild with the real
public configuration before running the connected application.
