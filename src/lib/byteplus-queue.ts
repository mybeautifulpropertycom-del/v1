import type { SupabaseClient } from "@supabase/supabase-js";
import { bytePlusGenerationStatus } from "./byteplus-video";

export const bytePlusQueueDependencies = { status: bytePlusGenerationStatus };

/** Read-only provider checks release capacity even if the property was deleted,
 * paused, or its second scene finished before the first. Unknown submissions
 * never expire into an automatic second billable request. */
export async function refreshBytePlusCapacity(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("claim_byteplus_slot_checks");
  if (error) throw new Error("Install the BytePlus shared queue upgrade.");
  await Promise.all(
    ((data || []) as { request_id: string }[]).map(async (slot) => {
      try {
        const result = await bytePlusQueueDependencies.status(slot.request_id);
        if (
          ["completed", "failed", "cancelled", "canceled"].includes(
            result.status,
          )
        ) {
          const released = await admin.rpc("finish_byteplus_scene_slot", {
            p_request: slot.request_id,
          });
          if (released.error)
            throw new Error("Capacity could not be released.");
        }
      } catch {
        // Status GETs may be retried. Keep the slot until a terminal response is known.
        console.warn(
          JSON.stringify({ event: "byteplus_capacity_check_deferred" }),
        );
      }
    }),
  );
}

/** Work on several properties per scheduler tick. Database leases and the shared
 * capacity pool protect overlapping invocations. Bound CPU-heavy editing and
 * stop starting work in time for the final step to finish within 180 seconds. */
export async function runVideoQueueBatch<T>(
  items: T[],
  process: (item: T) => Promise<string[]>,
  now: () => number = Date.now,
  deadline = now() + 60000,
) {
  let index = 0;
  const results: string[][] = [];
  await Promise.all(
    Array.from({ length: Math.min(3, items.length) }, async () => {
      while (index < items.length && now() < deadline) {
        const position = index++;
        try {
          results[position] = await process(items[position]);
        } catch {
          // A broken property must not prevent other agents' films from advancing.
          results[position] = ["worker_deferred"];
          console.warn(
            JSON.stringify({ event: "property_film_worker_deferred" }),
          );
        }
      }
    }),
  );
  return results.flat();
}
