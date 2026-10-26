# Platform administration

A protected administrator can review every agent account and property, then publish a property at no charge with its included video. Ordinary agents keep the $97 USD purchase workflow. Administrators also publish their own properties directly from the regular editor.

## Activate on an existing installation

1. Wait for the new Vercel production deployment to become **Ready**. The existing server-only `SUPABASE_SERVICE_ROLE_KEY` is used; no new environment variables are required.
2. In Supabase → SQL Editor → New query, paste **all** of [`supabase/sql-editor-platform-admin.sql`](../supabase/sql-editor-platform-admin.sql) and run it as the database owner. Expect `MBP_ADMIN_READY`. This additive upgrade requires the existing publish workflow, Higgsfield jobs and property films migrations. It adds protected tables and replaces publication/video eligibility functions; it does not delete existing accounts, properties or Stripe receipts.
3. Grant the role to the exact login email of an existing account, in a separate SQL Editor query:

   ```sql
   select public.grant_platform_admin('YOUR_EXISTING_LOGIN_EMAIL');
   ```

   Expect `MBP_ADMIN_GRANTED`. The function fails if the email does not identify exactly one account. This function is deliberately inaccessible to browser users and the application's service role. Do not add an admin email to a `NEXT_PUBLIC_` variable or editable profile metadata.
4. Refresh the app while signed into that account. **Administration** appears in the sidebar. Open **Agent accounts → View properties → Review property**, then **Publish at no charge**. The administrator's own editor uses the same grant automatically when clicking **Publish Property**.

The updated full installer already includes this upgrade. Do not rerun older standalone Stripe/Higgsfield/film installers afterward: they contain older versions of shared functions. If needed, reapply the admin upgrade last. The admin installer is idempotent and does not grant anyone a role automatically.

## Behavior

- Account directory shows login email, name, agency/contact, last sign-in and property count. Search and pagination are server-side. It does not expose passwords or impersonate agents.
- Property review shows the current template, owner's profile, publication status and video progress. It is a preview, including for private drafts; incomplete listings must be completed before publication.
- A separate complimentary grant supplies publication/video access. Stripe orders retain their actual payment status; free publication does not fabricate a payment or a refund.
- Open Stripe sessions are expired before the grant. Session creation that races with the grant is fenced by the order attempt and expires its session before returning a payment form. Payments already in confirmation must finish before granting. If an earlier genuine payment completed, it is reconciled; this action does not refund it.
- Grant, publication, one queued video job and audit entry commit together. Repeated publication does not regenerate or duplicate a completed video. A later refund does not revoke an independently approved complimentary grant.
- The video uses the configured service pipeline and platform credentials. In `PROPERTY_VIDEO_MODE=photo-montage`, it animates original photographs; analysis uses OpenAI and rendering/storage use the hosting services. It consumes no Higgsfield generation credits. A configured generative Higgsfield mode consumes the platform's Higgsfield credits. The existing `HIGGSFIELD_ENABLED=true` worker switch and scheduler are needed in both cases.
- Site publication is immediate; video processing continues in the background and the finished film appears automatically. Video failures retain the public website and are visible in status. This feature does not verify live provider billing or scheduler execution by itself.
- Client RLS stays owner-scoped. Each admin API verifies the Supabase user and the protected role before using server credentials. The publication transaction checks the role again and records actor, property, reason and time in `platform_admin_audit`.

## Remove administrator access

Run as the database owner, substituting the account's current login email:

```sql
delete from public.platform_admins
where user_id in (select id from auth.users where lower(email)=lower('YOUR_EXISTING_LOGIN_EMAIL'));
```

The role is tied to the account UUID and survives an email change. Revocation blocks subsequent admin API requests, including from already-open tabs. Previously approved publications remain complimentary. Deleting a property removes its associated grant; audit records persist.

## Validation

Local PostgreSQL tests cover role escalation attempts, RLS, invalid-publication rollback, idempotent grants/video jobs, unpaid video completion, public film access and refund interactions. API tests cover verified identity, fail-closed authorization, safe cross-account reads, checkout expiry and concurrent changes. Browser tests cover the panel, own-editor free publication, agent exclusion and mobile layout using mocked services. No real payment, credit-consuming generation or production admin grant is executed by these tests.
