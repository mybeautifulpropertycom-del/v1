// Server routes only. Resend and Supabase service credentials never reach clients.
import { createClient } from "@supabase/supabase-js";

type Details = {
  agentName: string;
  propertyTitle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
};
export type LeadEmailPayload = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
};
type Job = {
  inquiry_id: string;
  recipient: string;
  details: Details;
  lease_token: string;
  email_payload: LeadEmailPayload | null;
};
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function leadEmailConfiguration(
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !serviceKey || !supabaseUrl) return null;
  try {
    const site = new URL(env.NEXT_PUBLIC_SITE_URL || "");
    if (
      site.protocol !== "https:" ||
      site.username ||
      site.password ||
      site.pathname !== "/" ||
      site.search ||
      site.hash
    )
      return null;
    return {
      apiKey,
      serviceKey,
      supabaseUrl,
      inboxUrl: `${site.origin}/dashboard/inquiries`,
    };
  } catch {
    return null;
  }
}

export function leadEmailPayload(
  job: Pick<Job, "recipient" | "details">,
  inboxUrl: string,
): LeadEmailPayload {
  const d = job.details;
  const subject = `New inquiry: ${d.propertyTitle}`
    .replace(/[\r\n]/g, " ")
    .slice(0, 180);
  const text = `Hello ${d.agentName || "there"},\n\nYou have a new inquiry for ${d.propertyTitle}.\n\nName: ${d.name}\nEmail: ${d.email}\nPhone: ${d.phone || "Not provided"}\n\n${d.message}\n\nOpen My inbox: ${inboxUrl}\n\nMy Beautiful Property`;
  return {
    from: "My Beautiful Property <account@mybeautifulproperty.com>",
    to: [job.recipient],
    reply_to: d.email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#253c30;max-width:600px;margin:auto;padding:28px"><p style="font-size:12px;letter-spacing:2px">MY BEAUTIFUL PROPERTY</p><h1 style="font-size:26px">A new hello. A new possibility.</h1><p>Hello ${escapeHtml(d.agentName || "there")},</p><p>You have a new inquiry for <strong>${escapeHtml(d.propertyTitle)}</strong>.</p><p><strong>Name:</strong> ${escapeHtml(d.name)}<br><strong>Email:</strong> ${escapeHtml(d.email)}<br><strong>Phone:</strong> ${escapeHtml(d.phone || "Not provided")}</p><p style="white-space:pre-wrap;background:#f7f7f1;padding:18px;border-radius:8px">${escapeHtml(d.message)}</p><p><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#d96947;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px">Open My inbox</a></p><p style="font-size:12px;color:#727a70">You received this notification because someone contacted you through your property website.</p></div>`,
  };
}

export async function runLeadEmailWorker(
  options: { env?: Partial<NodeJS.ProcessEnv>; fetcher?: typeof fetch } = {},
) {
  const config = leadEmailConfiguration(options.env);
  if (!config) return { configured: false, processed: 0, sent: 0 };
  const fetcher = options.fetcher || fetch;
  const db = createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetcher(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  const { data, error } = await db.rpc("claim_lead_emails", { batch_size: 2 });
  if (error) throw new Error("Lead notification queue unavailable.");
  const jobs = (data || []) as Job[];
  const sent = await Promise.all(
    jobs.map(async (job) => {
      let payload = job.email_payload;
      if (!payload) {
        payload = leadEmailPayload(job, config.inboxUrl);
        // Freeze the provider payload before the first send. Retries use precisely
        // the same body and idempotency key, even after profile/config edits.
        const saved = await db
          .from("lead_email_jobs")
          .update({ email_payload: payload })
          .eq("inquiry_id", job.inquiry_id)
          .eq("lease_token", job.lease_token)
          .eq("status", "processing")
          .select("email_payload")
          .maybeSingle();
        if (saved.error || !saved.data) return false;
        payload = saved.data.email_payload as LeadEmailPayload;
      }
      let providerId: string | null = null;
      let failure: string | null = null;
      let retryable = true;
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `lead-notification/${job.inquiry_id}`,
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.id === "string" && result.id.length < 200)
            providerId = result.id;
          else failure = "invalid_provider_response";
        } else {
          failure = `provider_http_${response.status}`;
          retryable =
            response.status === 429 ||
            response.status >= 500 ||
            response.status === 408;
        }
      } catch {
        failure = "provider_unavailable";
      }
      const finished = await db.rpc("finish_lead_email", {
        job_id: job.inquiry_id,
        job_lease: job.lease_token,
        delivered_id: providerId,
        failure_code: failure,
        retryable,
      });
      if (finished.error || finished.data !== true) {
        // A lost acknowledgement leaves the lease recoverable, never a new key.
        console.warn(
          JSON.stringify({ event: "lead_email_acknowledgement_failed" }),
        );
        return false;
      }
      if (!providerId)
        console.warn(
          JSON.stringify({ event: "lead_email_deferred", code: failure }),
        );
      return Boolean(providerId);
    }),
  );
  return {
    configured: true,
    processed: jobs.length,
    sent: sent.filter(Boolean).length,
  };
}
