import type { SupabaseClient } from "@supabase/supabase-js";

/** Upload with real browser transfer progress; storage RLS still checks the agent's JWT. */
export async function uploadPropertyPhoto(
  supabase: SupabaseClient,
  path: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new Error("Sign in again to upload your photographs.");
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const url = `${origin.replace(/\/$/, "")}/storage/v1/object/property-images/${path}`;
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const fail = () =>
      reject(
        new Error(
          "This photograph could not be uploaded. Check your connection and try again.",
        ),
      );
    request.open("POST", url);
    request.timeout = 180000;
    request.setRequestHeader(
      "Authorization",
      `Bearer ${data.session!.access_token}`,
    );
    request.setRequestHeader(
      "apikey",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    request.setRequestHeader("Content-Type", "image/webp");
    request.setRequestHeader("Cache-Control", "max-age=31536000");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.min(0.99, event.loaded / event.total));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
      } else fail();
    };
    request.onerror = request.ontimeout = request.onabort = fail;
    request.send(blob);
  });
}
