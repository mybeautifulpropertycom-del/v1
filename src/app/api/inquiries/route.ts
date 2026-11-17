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
        { error: "Mesajul este prea lung." },
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
            "Formularele de contact nu sunt încă activate. Contactează direct agentul.",
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
          error: "Mesajul nu a putut fi livrat. Contactează direct agentul.",
        },
        { status: 503 },
      );
    if (data !== "received")
      return NextResponse.json(
        {
          error:
            data === "rate_limited"
              ? "Ai trimis deja câteva mesaje. Încearcă mai târziu sau contactează direct agentul."
              : "Această proprietate nu mai acceptă mesaje.",
        },
        { status: data === "rate_limited" ? 429 : 404 },
      );
    after(async () => {
      try {
        const delivery = await runLeadEmailWorker();
        if (!delivery.configured)
          console.warn(
            JSON.stringify({ event: "lead_notification_not_configured" }),
          );
      } catch {
        console.warn(
          JSON.stringify({ event: "lead_notification_worker_failed" }),
        );
      }
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Verifică mesajul și încearcă din nou." },
      { status: 400 },
    );
  }
}
