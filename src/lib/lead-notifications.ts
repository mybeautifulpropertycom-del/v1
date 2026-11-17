import { PLATFORM_CONTACT_EMAIL, PLATFORM_NAME } from "./platform-brand";
// Server routes only. Resend and Supabase service credentials never reach clients.
import { createClient } from "@supabase/supabase-js";

// The new domain is verified. Frozen retry payloads keep their original sender.

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
  const senderEmail = env.RESEND_FROM_EMAIL?.trim() || PLATFORM_CONTACT_EMAIL;
  if (
    senderEmail.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)
  )
    return null;
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
      senderEmail,
      inboxUrl: `${site.origin}/panou/mesaje`,
    };
  } catch {
    return null;
  }
}

export function leadEmailPayload(
  job: Pick<Job, "recipient" | "details">,
  inboxUrl: string,
  senderEmail = PLATFORM_CONTACT_EMAIL,
): LeadEmailPayload {
  const d = job.details;
  const subject = `Solicitare nouă: ${d.propertyTitle}`
    .replace(/[\r\n]/g, " ")
    .slice(0, 180);
  const text = `Bună, ${d.agentName || ""},\n\nAi o solicitare nouă pentru ${d.propertyTitle}.\n\nNume: ${d.name}\nEmail: ${d.email}\nTelefon: ${d.phone || "Necompletat"}\n\n${d.message}\n\nDeschide mesajele: ${inboxUrl}\n\nUrmătoarea Proprietate`;
  return {
    from: `${PLATFORM_NAME} <${senderEmail}>`,
    to: [job.recipient],
    reply_to: d.email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#253c30;max-width:600px;margin:auto;padding:28px"><p style="font-size:12px;letter-spacing:2px">${PLATFORM_NAME.toLocaleUpperCase("ro-RO")}</p><h1 style="font-size:26px">Un mesaj nou. O nouă posibilitate.</h1><p>Bună, ${escapeHtml(d.agentName || "")},</p><p>Ai o solicitare nouă pentru <strong>${escapeHtml(d.propertyTitle)}</strong>.</p><p><strong>Nume:</strong> ${escapeHtml(d.name)}<br><strong>Email:</strong> ${escapeHtml(d.email)}<br><strong>Telefon:</strong> ${escapeHtml(d.phone || "Necompletat")}</p><p style="white-space:pre-wrap;background:#f7f7f1;padding:18px;border-radius:8px">${escapeHtml(d.message)}</p><p><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#d96947;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px">Deschide mesajele</a></p><p style="font-size:12px;color:#727a70">Ai primit această notificare deoarece cineva te-a contactat prin site-ul proprietății.</p></div>`,
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
        payload = leadEmailPayload(job, config.inboxUrl, config.senderEmail);
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
