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
  NEXT_PUBLIC_SITE_URL: "https://urmatoarea-proprietate.ro",
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
    "https://urmatoarea-proprietate.ro/panou/mesaje",
  );
  assert.deepEqual(payload.to, ["owner@example.com"]);
  assert.equal(payload.reply_to, "buyer@example.com");
  assert.equal(
    payload.from,
    "Următoarea Proprietate <contact@urmatoarea-proprietate.ro>",
  );
  assert.ok(!payload.html.includes("<script>"));
  assert.ok(!payload.html.includes("<img onerror"));
  assert.ok(payload.html.includes("&lt;script&gt;"));
  assert.ok(payload.text.includes(job.details.message));
  assert.ok(
    payload.html.includes("https://urmatoarea-proprietate.ro/panou/mesaje"),
  );
});
test("each inquiry has a distinct inbox action after the message, without changing on retries", () => {
  const inboxUrl = "https://urmatoarea-proprietate.ro/panou/mesaje";
  const first = leadEmailPayload(job, inboxUrl);
  const second = leadEmailPayload(
    { ...job, inquiry_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    inboxUrl,
  );
  const href = (html: string) => html.match(/<a href="([^"]+)"/)![1];
  const link = new URL(href(first.html));
  assert.equal(link.origin, "https://urmatoarea-proprietate.ro");
  assert.equal(link.pathname, "/panou/mesaje");
  assert.equal(link.searchParams.get("solicitare"), job.inquiry_id);
  assert.notEqual(href(first.html), href(second.html));
  assert.deepEqual(first, leadEmailPayload(job, inboxUrl));
  assert.ok(
    first.html.indexOf("Deschide mesajele") > first.html.indexOf("Nume:"),
  );
  assert.ok(
    first.text.indexOf("Deschide mesajele") >
      first.text.indexOf(job.details.message),
  );
  assert.ok(
    first.html.indexOf("Deschide mesajele") >
      first.html.indexOf("Viewing request"),
  );
  assert.ok(first.text.includes(link.toString()));
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
  assert.equal(
    (
      await runLeadEmailWorker({
        env: { ...env, RESEND_FROM_EMAIL: "account@mybeautifulproperty.com" },
        fetcher,
      })
    ).sent,
    0,
  );
  assert.equal(
    (
      await runLeadEmailWorker({
        env: {
          ...env,
          NEXT_PUBLIC_SITE_URL: "https://changed.example.com",
          RESEND_FROM_EMAIL: "contact@urmatoarea-proprietate.ro",
        },
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

test("a verified new-domain sender applies to new messages and invalid sender configuration makes no request", async () => {
  let payload: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/rpc/claim_lead_emails")) return Response.json([job]);
    if (url.includes("/lead_email_jobs?")) {
      payload = JSON.parse(init!.body as string).email_payload;
      return Response.json({ email_payload: payload });
    }
    if (url === "https://api.resend.com/emails")
      return Response.json({ id: "verified-new-domain" });
    if (url.includes("/rpc/finish_lead_email")) return Response.json(true);
    throw new Error("Unexpected request");
  };
  assert.equal(
    (
      await runLeadEmailWorker({
        env: { ...env, RESEND_FROM_EMAIL: "contact@urmatoarea-proprietate.ro" },
        fetcher,
      })
    ).sent,
    1,
  );
  assert.equal(
    payload!.from,
    "Următoarea Proprietate <contact@urmatoarea-proprietate.ro>",
  );
  assert.ok(String(payload!.html).includes("URMĂTOAREA PROPRIETATE"));
  assert.ok(!String(payload!.html).includes("MY BEAUTIFUL PROPERTY"));
  let calls = 0;
  const invalid = await runLeadEmailWorker({
    env: {
      ...env,
      RESEND_FROM_EMAIL: "bad@example.com\nBcc: hidden@example.com",
    },
    fetcher: async () => {
      calls++;
      throw new Error("Must not send");
    },
  });
  assert.equal(invalid.configured, false);
  assert.equal(calls, 0);
});
