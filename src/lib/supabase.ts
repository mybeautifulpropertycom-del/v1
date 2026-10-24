import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client)
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  return client;
}

export function serverSupabase(
  accessToken?: string,
  signal?: AbortSignal,
): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        ...(accessToken
          ? { headers: { Authorization: `Bearer ${accessToken}` } }
          : {}),
        ...(signal
          ? {
              fetch: (input: RequestInfo | URL, init?: RequestInit) =>
                fetch(input, {
                  ...init,
                  signal: AbortSignal.any([
                    signal,
                    AbortSignal.timeout(10000),
                    ...(init?.signal ? [init.signal] : []),
                  ]),
                }),
            }
          : {}),
      },
    },
  );
}
