import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("../scripts/check-deployment-env.mjs", import.meta.url),
);
const examplePublishableKey = "sb_publishable_example_for_validation_only";
function validate(values: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [script], {
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: examplePublishableKey,
      ...values,
    },
    encoding: "utf8",
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

test("Vercel rejects missing configuration instead of publishing a demo", () => {
  const result = validate({
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(result.output, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("Vercel rejects privileged key types without logging their values", () => {
  const serviceRole = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  for (const key of ["sb_secret_private_fixture", serviceRole]) {
    const result = validate({ NEXT_PUBLIC_SUPABASE_ANON_KEY: key });
    assert.equal(result.status, 1);
    assert.equal(result.output.includes(key), false);
  }
});

test("public keys work with an initial Vercel URL or a configured custom domain", () => {
  const anon = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
  for (const key of [examplePublishableKey, anon]) {
    for (const site of ["", "https://mybeautifulproperty.com"]) {
      const result = validate({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
        NEXT_PUBLIC_SITE_URL: site,
      });
      assert.equal(result.status, 0, result.output);
      assert.equal(result.output.includes(key), false);
    }
  }
});

test("deployment URLs reject localhost, embedded credentials, and non-origin values", () => {
  for (const variable of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    for (const value of [
      "http://localhost:3000",
      "https://127.0.0.1",
      "https://[::1]",
      "https://app.localhost",
      "https://user:password@example.com",
      "https://example.com/dashboard",
      "https://example.com/?token=private",
      "https://example.com/#private",
    ]) {
      const result = validate({ [variable]: value });
      assert.equal(result.status, 1, `${variable}: ${value}`);
      assert.equal(result.output.includes(value), false);
    }
  }
});
