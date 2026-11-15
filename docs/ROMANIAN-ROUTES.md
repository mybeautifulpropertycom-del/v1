# Romanian platform URLs

Page routes use ASCII Romanian slugs. Existing links redirect permanently (308),
preserving query parameters; browser redirects also retain authentication fragments.

| Before                      | Canonical page                  |
| --------------------------- | ------------------------------- |
| `/dashboard`                | `/panou`                        |
| `/dashboard/properties/new` | `/panou/proprietati/noua`       |
| `/dashboard/properties/:id` | `/panou/proprietati/:id`        |
| `/dashboard/templates`      | `/panou/modele`                 |
| `/dashboard/profile`        | `/panou/profil`                 |
| `/dashboard/inquiries`      | `/panou/mesaje`                 |
| `/dashboard/video`          | `/panou/video`                  |
| `/dashboard/admin`          | `/panou/administrare`           |
| `/admin/properties/:id`     | `/administrare/proprietati/:id` |
| `/templates/:template`      | `/modele/:template`             |
| `/preview/:id`              | `/previzualizare/:id`           |
| `/login`                    | `/autentificare`                |
| `/register`                 | `/inregistrare`                 |
| `/reset-password`           | `/resetare-parola`              |
| `/p/:slug/print`            | `/p/:slug/tiparire`             |

Navigation, editor links, notification inbox links and print links use canonical
paths. Template identifiers and `template` query values retain their stable IDs.
The root home/login page, API endpoints, webhook endpoints and published property
addresses are unchanged.

Supabase confirmation/reset callbacks deliberately retain their existing
allow-listed entry URLs (`/dashboard/profile`, `/reset-password`). Stripe return
URLs also retain existing entry URLs for compatibility with pending sessions and
idempotent retries. The redirects land visitors on their Romanian equivalents.
No Supabase or Stripe dashboard reconfiguration is required for this release.

The new platform root names are rejected as standalone property addresses by
save and publication validation; agents must supply a full property address.

Validation covers legacy redirects/query preservation, confirmation entry links,
password-reset hash preservation, Romanian navigation and the connected property,
payment, account, admin and print flows. Existing payment tests retain the legacy
provider return URLs intentionally.
