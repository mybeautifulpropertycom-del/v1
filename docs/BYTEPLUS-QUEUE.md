# Shared BytePlus generation queue

Run `supabase/sql-editor-byteplus-queue.sql` in Supabase SQL Editor once (the installer is idempotent). It includes the previous parallel-scene upgrade. Expect `MBP_BYTEPLUS_QUEUE_READY`. Deploy the matching application version. No environment-variable change or scheduler reinstall is needed. Until the shared-queue RPC is installed, the new worker pauses BytePlus submissions rather than running without a global cap.

The private `byteplus_queue_settings.max_active` value starts at **3**, based on the supplied Individual quota documentation. This is a limit across all properties and all Vercel instances using this database, not a per-property setting. API access alone does not establish Enterprise status. Requests made directly in the provider console or by another application are outside this pool and still consume the provider account quota.

Each property can overlap at most two scenes. When other prepared films have no active scene, those films get priority before a second scene of another film. Among waiting prepared films, the least recently served is first. Photo analysis and final editing do not consume generation slots. The worker examines up to 12 due properties per invocation, with three local processing lanes and a shared deadline; database job leases protect overlapping scheduler/publication wakeups. The existing once-per-minute scheduler remains the durable fallback.

Slots are reserved atomically **before** a billable POST. Submitted/ambiguous requests consume capacity even if their property is later deleted, refunded, or rebuilt. Independent, leased status GETs release slots only on confirmed terminal provider results; this also releases an out-of-order second scene without waiting for editing of the first. Original request IDs and saved scene files are retained. A missing provider result or a timed-out POST never frees a slot merely because time has elapsed.

An explicitly rejected HTTP 429 releases only its own unaccepted reservation and defers the job, with a global 1/2/4/8/8-minute cooldown. Accepted neighboring scenes continue to be checked. After five automatic deferrals for a job, another rejection pauses it for review. Other explicit validation/auth/payment errors continue to require manual review; uncertain/5xx/timeouts are never automatically re-POSTed. Existing administrator resume and duration-repair operations can release only demonstrably rejected, unaccepted reservations.

The concurrency setting does not change scene count, duration, quality, the saved generation budget, or the property purchase price. It reduces avoidable idle time; it cannot guarantee a delivery time or make an Individual account process ten scenes simultaneously.

## Raising the quota

Ask BytePlus to confirm the account-specific concurrent-task limit for `dreamina-seedance-2-5-260628` in the Singapore region and approve **10** if needed. Suggested request:

> We operate a real-estate video platform and need to serve 10 agents publishing properties concurrently. Please confirm our current concurrent video generation task quota for dreamina-seedance-2-5-260628 in ap-southeast-1 and the requirements to increase it to 10. We use short 720p image-to-video tasks. Please also confirm the applicable requests-per-minute and status-query rate limits.

Only after BytePlus approves the higher quota, update it as the database administrator:

```sql
update public.byteplus_queue_settings set max_active=10 where id=true;
```

No code change or redeploy is necessary. To reserve provider capacity for external tools, set this application below the account quota. Lowering the setting does not cancel accepted requests; new submissions wait for existing ones to finish.

## Read-only diagnostics

```sql
select max_active, cooldown_until,
  (select count(*) from public.byteplus_scene_slots where active) as reserved_slots,
  (select count(*) from public.byteplus_scene_slots where active and request_id is null) as unbound_slots,
  (select count(*) from public.property_video_jobs where status in ('queued','processing')) as unfinished_films
from public.byteplus_queue_settings;
```

An unbound slot may be a live POST or an ambiguous submission. Do not delete it to bypass the cap: reconcile the request first. Read-only status checks do not purchase replacement generations. Customers continue to see simple scene progress; operational diagnostics stay private.
