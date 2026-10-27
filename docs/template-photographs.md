# Template preview photographs

The three `/templates/[template]` previews and Design templates thumbnails use the owner-supplied `Folder nou (2).rar` photographs. Agent property records and their uploaded photographs are not changed.

`src/lib/template-photos.ts` defines the shared gallery order: exterior, bedrooms, bathrooms, kitchen, then living/circulation spaces. Numeric order is retained within each group, including suffixed filenames. The first exterior photograph is the cover.

All 40 files were converted with Sharp: auto-orientation, WebP quality 82, effort 6, original 1024 × 682 resolution, no crop or enlargement, metadata stripped. Total size: 4,003,636 bytes originally; 2,471,272 bytes in WebP (38% smaller). PropertyImage adds responsive sizes and native lazy loading; cover images remain prioritized.

## Source mapping

| Uploaded filename | WebP in public/images/template-property |
| --- | --- |
| My Beautiful Property 1.jpg | 01-exterior.webp |
| My Beautiful Property (2).jpg | 02-exterior.webp |
| My Beautiful Property (3).jpg | 03-exterior.webp |
| My Beautiful Property (4).jpg | 04-exterior.webp |
| My Beautiful Property (5).jpg | 05-exterior.webp |
| My Beautiful Property (6).jpg | 06-exterior.webp |
| My Beautiful Property (7).jpg | 07-exterior.webp |
| My Beautiful Property (8).jpg | 08-exterior.webp |
| My Beautiful Property (9).jpg | 09-exterior.webp |
| My Beautiful Property (10).jpg | 10-exterior.webp |
| My Beautiful Property (11).jpg | 11-exterior.webp |
| My Beautiful Property (12).jpg | 12-exterior.webp |
| My Beautiful Property (13).jpg | 13-bedroom.webp |
| My Beautiful Property (14).jpg | 14-bedroom.webp |
| My Beautiful Property (15).jpg | 15-bedroom.webp |
| My Beautiful Property (16).jpg | 16-bedroom.webp |
| My Beautiful Property (16 - 1).jpg | 17-bedroom.webp |
| My Beautiful Property (16 - 2).jpg | 18-bedroom.webp |
| My Beautiful Property (17).jpg | 19-bedroom.webp |
| My Beautiful Property (26).jpg | 20-bathroom.webp |
| My Beautiful Property (27).jpg | 21-bathroom.webp |
| My Beautiful Property (28).jpg | 22-bathroom.webp |
| My Beautiful Property (29).jpg | 23-bathroom.webp |
| My Beautiful Property (30).jpg | 24-bathroom.webp |
| My Beautiful Property (31).jpg | 25-bathroom.webp |
| My Beautiful Property (32).jpg | 26-bathroom.webp |
| My Beautiful Property (33).jpg | 27-kitchen.webp |
| My Beautiful Property (34).jpg | 28-kitchen.webp |
| My Beautiful Property (35).jpg | 29-kitchen.webp |
| My Beautiful Property (36).jpg | 30-kitchen.webp |
| My Beautiful Property (37).jpg | 31-kitchen.webp |
| My Beautiful Property (38).jpg | 32-kitchen.webp |
| My Beautiful Property (18).jpg | 33-living.webp |
| My Beautiful Property (18-1).jpg | 34-living.webp |
| My Beautiful Property (19).jpg | 35-living.webp |
| My Beautiful Property (20).jpg | 36-living.webp |
| My Beautiful Property (21).jpg | 37-living.webp |
| My Beautiful Property (22).jpg | 38-living.webp |
| My Beautiful Property (23).jpg | 39-living.webp |
| My Beautiful Property (24).jpg | 40-living.webp |
