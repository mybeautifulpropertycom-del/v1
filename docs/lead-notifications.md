# Lead notifications

New contact forms and tour requests are saved through the existing rate-limited inquiry RPC. A database trigger creates a private email job in the same transaction. No request can choose the recipient: it is the property's owner's **Supabase login email**, not the editable public contact email.

The app attempts delivery after returning the successful form response. A scheduled worker retries eligible jobs every minute, including inquiries submitted directly through the public RPC. The lead remains saved if Resend is unavailable. Existing leads become unread at installation, but no historical emails are queued.

## Activate on the existing deployment

1. In Supabase SQL Editor, run **all** of `supabase/sql-editor-lead-notifications.sql`. Expect `MBP_LEAD_NOTIFICATIONS_READY`.
2. In Vercel → v1 → Environment Variables → **Production**, add `RESEND_API_KEY` as **Secret**. Create/use a Resend API key with sending permission for the already verified `mybeautifulproperty.com` domain. The key used as the Supabase SMTP password can be reused if it has the appropriate sending permission. Never put it in chat or prefix it with `NEXT_PUBLIC_`.
3. The existing `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SITE_URL=https://www.mybeautifulproperty.com`, and `CRON_SECRET` are also required. No Stripe or Higgsfield credentials are used by this worker. Redeploy after adding the Resend key.
4. Run `supabase/configure-lead-notifications.sql`. Expect `MBP_LEAD_EMAILS_SCHEDULED`. It reuses the site origin and worker secret already stored in Supabase Vault for the video scheduler; it creates a separate minute-based email job and does not alter the video schedule. The Vault worker secret must match the current Vercel `CRON_SECRET`.
5. From a published property, submit one contact/tour request. Verify the lead appears in the owner's inbox, a red badge appears, and the owner receives an email. Use **Mark as read**, then refresh to confirm persistence.

Sender: **My Beautiful Property <account@mybeautifulproperty.com>**. Reply-To is the buyer's email. The notification includes buyer contact details, the message/viewing request, property title and a link to the authenticated inbox. Resend SMTP configured within Supabase Auth alone does not send application lead notifications. This feature does not change authentication email templates.

## Inbox behavior

- `My inbox` shows a red count (99+ above 99) of the current owner's unread leads.
- New cards have a red accent and a `New` label. Explicit **Mark as read** removes that lead from the badge; simply opening the inbox does not silently clear other leads.
- Counts and the open inbox refresh every 30 seconds while the tab is visible and immediately when returning to it. No Supabase Realtime publication configuration is needed.
- Delete and mark-read actions refresh the badge. Read state survives browser/device changes and is protected by the authenticated owner ID in SQL.
- The inbox retains its existing most-recent-100 limit. The unread badge counts all unread leads.

## Delivery semantics and troubleshooting

Private outbox rows are not readable or writable by anonymous users or agents. Service-only workers claim rows with `FOR UPDATE SKIP LOCKED`, a two-minute lease, and a fresh fencing token. The exact Resend payload is persisted before sending. Retries use `lead-notification/<inquiry UUID>` as the stable idempotency key; provider acknowledgement is committed only under the matching lease.

Network failures, HTTP 408/429 and server errors retry with backoff, up to eight attempts. Other provider 4xx errors fail for manual review. Because Resend retains idempotency keys for 24 hours, uncertain sends stop retrying after 20 hours. A response accepted by the provider means queued/sent, not a guarantee of delivery to the recipient's inbox. Check Resend Logs for bounces or delivery status.

Database administrators can inspect `lead_email_jobs.status`, `attempts`, `last_error`, `provider_id`, and `sent_at`. Do not publicly expose this table: it contains buyer information. Application logs contain generic error codes only. A failed/unconfigured mail system does not discard the lead or clear its unread status. No real external email is sent by the automated tests.

For a missing badge or inbox schema error, confirm `MBP_LEAD_NOTIFICATIONS_READY` was installed. For queued jobs that never send, check Vercel key/environment/redeploy, the Resend verified sending domain, `cron.job` entry `mbp-lead-email-worker`, and the Vault/CRON_SECRET match. Avoid replaying uncertain expired jobs manually without checking Resend for an existing send.
