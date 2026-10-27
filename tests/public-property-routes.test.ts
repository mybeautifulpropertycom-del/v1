import assert from "node:assert/strict";
import { test, after } from "node:test";
import { demoWorkspace } from "../src/lib/demo";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-routes.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
const sample = demoWorkspace();
const listing = {
  ...sample.properties[0],
  slug: "old-home",
  address_slug: "123-palm-drive",
};
let missing = false;
let calls = 0;
globalThis.fetch = async (_input, init) => {
  calls++;
  const { property_slug } = JSON.parse(String(init?.body));
  return Response.json(
    missing ||
      !["old-home", "earlier-address", "123-palm-drive"].includes(property_slug)
      ? null
      : { property: listing, profile: sample.profile },
  );
};
test("public routes redirect old links, render the address and use canonical metadata", async () => {
  const { default: legacy } = await import("../src/app/p/[slug]/page");
  const { default: address, generateMetadata } =
    await import("../src/app/[slug]/page");
  for (const [page, slug] of [
    [legacy, "old-home"],
    [address, "earlier-address"],
  ] as const) {
    await assert.rejects(
      page({ params: Promise.resolve({ slug }) }),
      (e: any) => e.digest === "NEXT_REDIRECT;replace;/123-palm-drive;307;",
    );
  }
  const element = await address({
    params: Promise.resolve({ slug: "123-palm-drive" }),
  });
  assert.equal(
    element.props.property.slug,
    "old-home",
    "contact forms keep their stable identifier",
  );
  const metadata = await generateMetadata({
    params: Promise.resolve({ slug: "123-palm-drive" }),
  });
  assert.equal(
    metadata.alternates?.canonical,
    "https://www.mybeautifulproperty.com/123-palm-drive",
  );
  const previous = calls;
  await assert.rejects(
    address({ params: Promise.resolve({ slug: "invalid.path" }) }),
    (e: any) => e.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
  );
  assert.equal(calls, previous);
  missing = true;
  await assert.rejects(
    address({ params: Promise.resolve({ slug: "123-palm-drive" }) }),
    (e: any) => e.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
  );
});
