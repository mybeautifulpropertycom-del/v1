import {
  BillingError,
  billingDatabase,
  billingJson as json,
  billingUser,
  readLimitedBody,
} from "@/lib/stripe-server";
import { generateProfileBio } from "@/lib/profile-bio-generator";
import {
  isProfileBioRole,
  MAX_PROFILE_BIO_GENERATIONS,
} from "@/lib/profile-bio";
import { PropertyStoryError } from "@/lib/property-story-error";

export const maxDuration = 60;
const unavailable = "Generarea AI nu este disponibilă momentan.";

function generationConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !serviceKey || !supabaseUrl)
    throw new BillingError(unavailable, 503);
  return { apiKey, db: billingDatabase({ serviceKey, supabaseUrl }) };
}

export async function GET(request: Request) {
  try {
    const { user } = await billingUser(request);
    const { db } = generationConfig();
    const { data, error } = await db
      .from("profile_bio_usage")
      .select("generations")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) throw new BillingError(unavailable, 503);
    return json({
      remaining: MAX_PROFILE_BIO_GENERATIONS - (data?.generations ?? 0),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await billingUser(request);
    const raw = await readLimitedBody(request, 4096);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new BillingError("Alege tipul de profil.", 400);
    }
    if (
      !isProfileBioRole(input?.role) ||
      typeof input.agency !== "string" ||
      input.agency.length > 120 ||
      typeof input.previousBio !== "string" ||
      input.previousBio.length > 1000
    )
      throw new BillingError("Verifică datele pentru prezentare.", 400);

    const { db, apiKey } = generationConfig();
    const attempt = { agent_id: user.id, attempt_id: crypto.randomUUID() };
    const { data: reserved, error: reservationError } = await db.rpc(
      "reserve_profile_bio",
      attempt,
    );
    if (reservationError || typeof reserved !== "number")
      throw new BillingError(unavailable, 503);
    if (reserved === 0)
      return json(
        { error: "Ai folosit toate cele trei generări AI.", remaining: 0 },
        429,
      );
    if (reserved < 0)
      throw new BillingError(
        "O generare pentru acest cont este deja în curs.",
        409,
      );

    let bio: string | undefined;
    let generationError: unknown;
    try {
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(30000),
      ]);
      bio = await generateProfileBio(
        {
          role: input.role,
          agency: input.role === "agent" ? input.agency.trim() : "",
          previousBio: input.previousBio.trim(),
        },
        {
          apiKey,
          model: "gpt-4.1-mini",
          signal,
        },
      );
    } catch (error) {
      generationError = error;
    }
    // Charge one slot for each request that reaches OpenAI, even if it fails.
    // Finalizing the attempt releases the lock without a post-error cooldown.
    const { data: remaining, error } = await db.rpc("finish_profile_bio", {
      ...attempt,
      succeeded: true,
    });
    if (error || typeof remaining !== "number")
      throw new BillingError(unavailable, 503);
    return bio ? json({ bio, remaining }) : failure(generationError, remaining);
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown, remaining?: number) {
  if (error instanceof BillingError)
    return json({ error: error.message }, error.status);
  const provider = error instanceof PropertyStoryError ? error : undefined;
  const code =
    provider?.code ??
    (error instanceof Error && error.name === "TimeoutError"
      ? "AI_TIMEOUT"
      : "AI_UNAVAILABLE");
  console.warn(
    JSON.stringify({
      event: "profile_bio_failed",
      code,
      providerStatus: provider?.providerStatus,
    }),
  );
  const messages: Partial<Record<typeof code, string>> = {
    AI_AUTH:
      "OpenAI a refuzat autentificarea. Administratorul trebuie să verifice integrarea.",
    AI_CREDITS: "Contul OpenAI nu are credite API disponibile momentan.",
    AI_BUSY:
      "Serviciul OpenAI este ocupat momentan. Poți edita prezentarea manual.",
    AI_MODEL: "Modelul selectat nu este disponibil pentru integrarea OpenAI.",
    AI_OUTPUT:
      "OpenAI nu a returnat o prezentare utilizabilă. Poți edita textul manual.",
    AI_TIMEOUT: "OpenAI nu a răspuns la timp. Poți edita prezentarea manual.",
  };
  return json(
    {
      error:
        messages[code] ??
        "Nu am putut genera prezentarea cu OpenAI. Poți edita textul manual.",
      code,
      ...(remaining === undefined ? {} : { remaining }),
    },
    provider?.status ?? (code === "AI_TIMEOUT" ? 504 : 502),
  );
}
