import { videoEnabled } from "@/lib/video-service";
import { after } from "next/server";
import { wakeVideoWorker } from "@/lib/higgsfield-worker";
import {
  billingDatabase,
  billingFailure,
  BillingError,
  billingJson,
  billingUser,
  readLimitedBody,
  stripeConfiguration,
  UUID,
} from "@/lib/stripe-server";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const { user } = await billingUser(request);
    let id: unknown;
    try {
      id = JSON.parse(await readLimitedBody(request, 1024)).propertyId;
    } catch {
      throw new BillingError("Alege o proprietate salvată.", 400);
    }
    if (typeof id !== "string" || !UUID.test(id))
      throw new BillingError("Alege o proprietate salvată.", 400);
    const config = stripeConfiguration();
    if (!config.live)
      throw new BillingError(
        "Este necesară o proprietate cu pachet achitat.",
        400,
      );
    const { data, error } = await billingDatabase(config).rpc(
      "retry_property_video",
      {
        listing_id: id,
        agent_id: user.id,
      },
    );
    if (error)
      throw new BillingError(
        "Filmul nu a putut fi adăugat în coadă. Încearcă din nou.",
      );
    if (!data)
      throw new BillingError(
        "Reîncercarea nu este disponibilă. Așteaptă un minut după o eroare; după trei încercări, contactează asistența.",
        409,
      );
    if (videoEnabled()) after(wakeVideoWorker);
    return billingJson({ videoStatus: "queued" });
  } catch (error) {
    return billingFailure(error);
  }
}
