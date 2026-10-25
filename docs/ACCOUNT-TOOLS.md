# Profile photos and deletion

For an existing Supabase project, run the **entire**
[`sql-editor-account-tools.sql`](../supabase/sql-editor-account-tools.sql) in
SQL Editor. Success returns `MBP_ACCOUNT_TOOLS_OK`. It is transactional and safe
to rerun. Do not run the full first-installation script on an existing project.
New installations include this migration in the full installer.

The update adds `profiles.avatar_url`, the public `agent-avatars` bucket and
owner-only upload/read-metadata/delete policies. Public pages receive the portrait
through the existing published-property RPC; private IDs stay private. Agents
upload JPG, PNG or WebP up to 10 MB, resized to at most 512 pixels and encoded as
WebP. **Save changes** updates the profile and all its property sites on their next
load. Missing/failed images use initials. Demo photos persist in IndexedDB.
Removing a profile photo restores initials after saving. Superseded or abandoned
avatar uploads remain in storage; this release does not add an orphan-file janitor.

Property deletion requires confirmation, uses an authenticated, RLS-protected
`delete_owned_property` RPC and removes the public property route. The migration
changes the inquiry foreign key to `ON DELETE SET NULL`, preserving the agent's
leads. The inbox labels those leads **Deleted property** and removes their property
link. A missing migration fails the RPC without deleting the property through the
old cascading constraint. After database deletion the client removes referenced
images only from this owner's exact property folder. Storage cleanup failures are
reported separately; previously discarded uploads are outside this cleanup.

Lead deletion also requires confirmation and is scoped by both inquiry ID and
owner ID. Failed requests leave the record visible and allow retry. Database RLS
remains the authority for all mutations; UI filters are not access control.

Tests cover an upgrade from the initial schema, repeatable installation, avatar
publication and storage ownership, forbidden cross-owner deletion, retained leads,
public-page removal, browser confirmation/cancellation, persistence after reload,
upload/remove photo flows, and a failed lead deletion. Connected browser HTTP is
mocked; PostgreSQL tests execute the migrations in PGlite.
