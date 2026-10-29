import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UUID } from "./stripe-server";

export function lifecycleDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Account maintenance is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
type CleanupJob = {
  id: string;
  kind: "property" | "account";
  target_id: string;
  owner_id: string;
  paths: { bucket: string; prefix: string }[];
};
const buckets = new Set([
  "property-images",
  "property-videos",
  "property-video-work",
  "agent-avatars",
]);
export function validateCleanupJob(value: CleanupJob) {
  if (
    !value ||
    !UUID.test(value.id) ||
    !UUID.test(value.owner_id) ||
    !UUID.test(value.target_id) ||
    !["account", "property"].includes(value.kind) ||
    !Array.isArray(value.paths) ||
    !value.paths.length
  )
    throw new Error("Invalid cleanup scope.");
  if (value.kind === "account" && value.target_id !== value.owner_id)
    throw new Error("Invalid account scope.");
  for (const path of value.paths) {
    const parts = path.prefix?.split("/");
    if (
      !buckets.has(path.bucket) ||
      !parts ||
      parts[0] !== value.owner_id ||
      parts.some((part) => !UUID.test(part)) ||
      parts.length !== (value.kind === "account" ? 1 : 2) ||
      (value.kind === "property" &&
        (path.bucket === "agent-avatars" ||
          (path.bucket === "property-images" && parts[1] !== value.target_id)))
    )
      throw new Error("Invalid storage scope.");
  }
}

// Remove page zero repeatedly: deleting while advancing offsets skips objects.
// Virtual folders disappear when empty. Every invocation is bounded and resumable.
export async function removeStorageTree(
  db: SupabaseClient,
  bucket: string,
  prefix: string,
  deadline: number,
  budget = { files: 0 },
): Promise<boolean> {
  while (Date.now() < deadline && budget.files < 500) {
    const { data, error } = await db.storage.from(bucket).list(prefix, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error || !data) throw new Error("Storage listing failed.");
    if (!data.length) return true;
    const files: string[] = [];
    for (const entry of data) {
      if (
        !entry.name ||
        entry.name === "." ||
        entry.name === ".." ||
        entry.name.includes("/")
      )
        throw new Error("Invalid storage entry.");
      const name = `${prefix}/${entry.name}`;
      if (entry.id) files.push(name);
      else if (!(await removeStorageTree(db, bucket, name, deadline, budget)))
        return false;
    }
    if (files.length) {
      const { error: removalError } = await db.storage
        .from(bucket)
        .remove(files);
      if (removalError) throw new Error("Storage removal failed.");
      budget.files += files.length;
    }
  }
  return false;
}

export async function runAccountCleanup(db = lifecycleDatabase()) {
  const { data: expired, error } = await db.rpc(
    "expire_unpublished_properties",
  );
  if (error) throw new Error("Install the account lifecycle database update.");
  const deadline = Date.now() + 70000;
  let completed = 0;
  for (let i = 0; i < 10 && Date.now() < deadline; i++) {
    const lease = crypto.randomUUID();
    const { data, error: claimError } = await db.rpc("claim_account_cleanup", {
      p_lease: lease,
    });
    if (claimError) throw new Error("Cleanup queue is unavailable.");
    if (!data) break;
    const job = data as CleanupJob;
    let done = false,
      failed = false;
    try {
      validateCleanupJob(job);
      if (job.kind === "account") {
        const { error: banError } = await db.auth.admin.updateUserById(
          job.owner_id,
          { ban_duration: "876000h" },
        );
        if (banError && banError.status !== 404)
          throw new Error("Account suspension failed.");
      }
      done = true;
      const budget = { files: 0 };
      for (const path of job.paths) {
        if (
          !(await removeStorageTree(
            db,
            path.bucket,
            path.prefix,
            deadline,
            budget,
          ))
        ) {
          done = false;
          break;
        }
      }
      if (done && job.kind === "account") {
        const { error: deletionError } = await db.auth.admin.deleteUser(
          job.owner_id,
        );
        if (deletionError && deletionError.status !== 404)
          throw new Error("Account deletion failed.");
      }
    } catch {
      done = false;
      failed = true;
    }
    const { data: acknowledged, error: finishError } = await db.rpc(
      "finish_account_cleanup",
      {
        p_id: job.id,
        p_lease: lease,
        p_done: done,
        p_failed: failed,
      },
    );
    if (finishError || acknowledged !== true)
      throw new Error("Cleanup checkpoint failed.");
    if (done) completed++;
  }
  return { expired: Number(expired || 0), completed };
}
