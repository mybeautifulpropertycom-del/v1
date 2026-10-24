import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Read-only diagnostics. Never print key values, response bodies, or auth headers.
const urlName = "NEXT_PUBLIC_SUPABASE_URL";
const keyName = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const projectUrl = process.env[urlName]?.trim();
const publicKey = process.env[keyName]?.trim();
const missing = [!projectUrl && urlName, !publicKey && keyName].filter(Boolean);
if (missing.length) {
  console.error(`Configuration missing: ${missing.join(", ")}.`);
  console.error(
    "Add these values in environment settings or .env.local. No network requests were made.",
  );
  process.exit(2);
}

let endpoint;
try {
  endpoint = new URL(projectUrl);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  )
    throw new Error();
} catch {
  console.error(
    "Use the HTTPS project URL from Supabase, without a path, query, or embedded credentials.",
  );
  process.exit(2);
}

let publicKeyType = publicKey.startsWith("sb_publishable_");
if (!publicKeyType) {
  try {
    const parts = publicKey.split(".");
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    publicKeyType = parts.length === 3 && payload.role === "anon";
  } catch {
    /* Report the key type, never its contents. */
  }
}
if (!publicKeyType) {
  console.error(
    "Use a publishable key or legacy anon key. Secret, service-role, and personal access keys must not be used in NEXT_PUBLIC variables.",
  );
  process.exit(2);
}

const timedFetch = (input, init) =>
  fetch(input, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
const supabase = createClient(endpoint.origin, publicKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { fetch: timedFetch },
});
let failures = 0;
function report(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
  if (!ok) failures++;
}

try {
  const response = await timedFetch(`${endpoint.origin}/auth/v1/health`, {
    headers: { apikey: publicKey },
  });
  report(
    response.ok,
    `Authentication service reachable (HTTP ${response.status}).`,
  );
} catch {
  report(
    false,
    "Authentication service could not be reached. Check project status, HTTPS/network access, and the project URL.",
  );
}

const probeSlug = `connection-check-${randomUUID()}`;
const publication = await supabase.rpc("get_public_property", {
  property_slug: probeSlug,
});
if (publication.error) {
  const missingMigration = publication.error.code === "PGRST202";
  report(
    false,
    missingMigration
      ? "Publication RPC is missing. Apply the initial migration to the intended project."
      : "Publication RPC could not be checked. Verify the public key, migration, and network access.",
  );
} else {
  report(
    publication.data === null,
    "Publication RPC is available and an unknown property is not exposed.",
  );
}

for (const table of ["profiles", "properties", "inquiries"]) {
  // limit(0) checks table grants without retrieving any personal or listing data.
  const result = await supabase.from(table).select("id").limit(0);
  report(
    result.error?.code === "42501",
    result.error?.code === "42501"
      ? `Anonymous direct access to ${table} is denied.`
      : result.error?.code === "PGRST205"
        ? `Table ${table} is not available in the API schema. Verify installation and the schema cache.`
        : `Anonymous access policy for ${table} does not match the expected schema, or could not be verified.`,
  );
}

console.log(
  "These checks do not create accounts, send emails, upload files, or modify the database.",
);
console.log(
  "Account signup/login, email delivery, image uploads, and two-account isolation still require a live integration test.",
);
process.exitCode = failures ? 1 : 0;
