import assert from "node:assert/strict";
import { test } from "node:test";
import {
  leadEmailPayload,
  runLeadEmailWorker,
} from "../src/lib/lead-notifications";
const env = {
  RESEND_API_KEY: "test-only-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SITE_URL: "https://www.mybeautifulproperty.com",
};
const job = {
  inquiry_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  lease_token: "lease-one",
  recipient: "owner@example.com",
  details: {
    agentName: "Agent",
    propertyTitle: "Home <script>",
    name: 'Buyer <img onerror="bad">',
    email: "buyer@example.com",
    phone: "123456789",
    message: "<script>alert(1)</script>\nViewing request",
  },
  email_payload: null,
};
test("lead email escapes untrusted content, uses the owner and supplies the inbox link and reply-to", () => {
  const payload = leadEmailPayload(
    job,
    "https://www.mybeautifulproperty.com/dashboard/inquiries",
  );
  assert.deepEqual(payload.to, ["owner@example.com"]);
  assert.equal(payload.reply_to, "buyer@example.com");
  assert.ok(payload.from.includes("account@mybeautifulproperty.com"));
  assert.ok(!payload.html.includes("<script>"));
  assert.ok(!payload.html.includes("<img onerror"));
  assert.ok(payload.html.includes("&lt;script&gt;"));
  assert.ok(payload.text.includes(job.details.message));
  assert.ok(
    payload.html.includes(
      "https://www.mybeautifulproperty.com/dashboard/inquiries",
    ),
  );
});
test("notification worker freezes payloads and retries with the same Resend idempotency key", async () => {
  let stored: ReturnType<typeof leadEmailPayload> | null = null;
  const requests: { key: string | null; body: string }[] = [];
  const completions: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/rpc/claim_lead_emails"))
      return Response.json([{ ...job, email_payload: stored }]);
    if (url.includes("/lead_email_jobs?")) {
      stored = JSON.parse(init!.body as string).email_payload;
      return Response.json({ email_payload: stored });
    }
    if (url.includes("/rpc/finish_lead_email")) {
      completions.push(JSON.parse(init!.body as string));
      return Response.json(true);
    }
    if (url === "https://api.resend.com/emails") {
      requests.push({
        key: new Headers(init?.headers).get("Idempotency-Key"),
        body: init!.body as string,
      });
      return requests.length === 1
        ? Response.json({ error: "rate limited" }, { status: 429 })
        : Response.json({ id: "provider-success" });
    }
    throw new Error("Unexpected request");
  };
  assert.equal((await runLeadEmailWorker({ env, fetcher })).sent, 0);
  assert.equal(
    (
      await runLeadEmailWorker({
        env: { ...env, NEXT_PUBLIC_SITE_URL: "https://changed.example.com" },
        fetcher,
      })
    ).sent,
    1,
  );
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(completions[0].retryable, true);
  assert.equal(completions[0].failure_code, "provider_http_429");
  assert.equal(completions[1].delivered_id, "provider-success");
});
test("unconfigured email delivery makes no external request", async () => {
  let calls = 0;
  const r = await runLeadEmailWorker({
    env: {},
    fetcher: async () => {
      calls++;
      throw new Error("Must not send");
    },
  });
  assert.equal(r.configured, false);
  assert.equal(calls, 0);
});
