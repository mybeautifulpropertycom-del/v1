import { after, NextResponse } from "next/server";
import { runLeadEmailWorker } from "@/lib/lead-notifications";
import { serverSupabase } from "@/lib/supabase";
import { validateInquiry } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 12000)
      return NextResponse.json(
        { error: "This message is too long." },
        { status: 413 },
      );
    const result = validateInquiry(JSON.parse(body));
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: 400 });
    const supabase = serverSupabase();
    if (!supabase)
      return NextResponse.json(
        {
          error:
            "Contact forms are not connected yet. Please contact the agent directly.",
        },
        { status: 503 },
      );
    const { data, error } = await supabase.rpc("submit_property_inquiry", {
      property_slug: result.value.slug,
      sender_name: result.value.name,
      sender_email: result.value.email,
      sender_phone: result.value.phone,
      sender_message: result.value.message,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            "Your message could not be delivered. Please contact the agent directly.",
        },
        { status: 503 },
      );
    if (data !== "received")
      return NextResponse.json(
        {
          error:
            data === "rate_limited"
              ? "You’ve already sent a few messages. Please try again later or contact the agent directly."
              : "This property is no longer accepting messages.",
        },
        { status: data === "rate_limited" ? 429 : 404 },
      );
    after(async () => {
      try {
        await runLeadEmailWorker();
      } catch {
        console.warn(
          JSON.stringify({ event: "lead_notification_worker_failed" }),
        );
      }
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Please check your message and try again." },
      { status: 400 },
    );
  }
}
