# The Heritage

The second design replaces the previous Minimal presentation. The stored template
ID and preview URL remain `minimal` so existing listings and the Supabase template
constraint continue to work. The collection now displays **The Heritage**.

The design follows the supplied image: cream navigation, a photograph that gently
zooms as the visitor scrolls, a property fact strip, an album-style introduction,
photograph gallery, a forest-green feature section, property film, agent contact,
location, and a closing invitation. All `Schedule a tour` buttons open the existing
viewing dialog and send to the same private inquiry inbox. Previews do not send.

The cover uses the agent's first uploaded photograph. Desktop scrolling briefly
pins the photograph while its scale increases from 1 to 1.2; mobile uses the same
zoom during normal page scrolling. Reduced motion disables the zoom and pinning.
No wheel or touch gestures are intercepted.

Saved property and agent data populate the page, including inline-editable title,
description and location. Gallery filters show all images or the first three;
captions do not infer room types. The design does not invent construction dates,
land dimensions, renovation history or interior features that are not collected.

The optional property film follows the same behavior as the Editorial template:
actual video when supplied, a labeled layout preview in sample/saved previews,
and no empty video section on published pages. Higgsfield remains a future
integration. No SQL migration or additional paid service is required.

Shared photo lightbox and viewing-dialog styles are tested with both designs.
Browser coverage also includes cover zoom/reduced motion, every tour CTA, gallery
filters, inline editing, profile synchronization, and phone layouts.
