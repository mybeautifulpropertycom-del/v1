// Vercel exports these variables before the build. Do not print their values.
const errors = [];
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

function isPublicHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost") &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

if (!projectUrl || !isPublicHttpsOrigin(projectUrl)) {
  errors.push(
    "NEXT_PUBLIC_SUPABASE_URL must be the HTTPS project origin from Supabase.",
  );
}

let publicKeyType = Boolean(
  publicKey?.match(/^sb_publishable_[A-Za-z0-9_-]+$/),
);
if (publicKey && !publicKeyType) {
  try {
    const parts = publicKey.split(".");
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    publicKeyType = parts.length === 3 && payload.role === "anon";
  } catch {
    // Report only the variable name and expected type.
  }
}
if (!publicKeyType) {
  errors.push(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY must be a publishable key or legacy anon key, never a secret or service-role key.",
  );
}
if (siteUrl && !isPublicHttpsOrigin(siteUrl)) {
  errors.push(
    "NEXT_PUBLIC_SITE_URL must be your app's public HTTPS origin. Leave it unset for the first Vercel deployment; do not use localhost.",
  );
}

if (errors.length) {
  console.error("Vercel deployment configuration is incomplete:");
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "Add the public configuration in Vercel Environment Variables for the target environment, then redeploy. See docs/DEPLOY-VERCEL.md.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Public deployment configuration has the expected format. No credentials were printed; remote connectivity is checked separately.",
  );
}
