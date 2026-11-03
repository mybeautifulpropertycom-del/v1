import assert from "node:assert/strict";
import { after, test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import { propertyShareLinks } from "../src/lib/property-sharing";

test("sharing uses canonical public URLs and safely encodes titles and email text", () => {
  const property = {
    ...demoWorkspace().properties[0],
    status: "published" as const,
    address_slug: "123-palm-drive",
    title: "Home & garden #1 — café",
  };
  const links = propertyShareLinks(property)!;
  assert.match(links.url, /\/123-palm-drive$/);
  assert.equal(new URL(links.facebook).searchParams.get("u"), links.url);
  assert.equal(new URL(links.linkedin).searchParams.get("url"), links.url);
  assert.equal(new URL(links.x).searchParams.get("url"), links.url);
  assert.equal(new URL(links.x).searchParams.get("text"), property.title);
  assert.equal(
    new URL(links.email).searchParams.get("subject"),
    property.title,
  );
  assert.equal(
    new URL(links.email).searchParams.get("body"),
    `${property.title}\n${property.location}\n\n${links.url}`,
  );
  assert.equal(links.print, `/p/${property.slug}/print`);
  assert.match(
    propertyShareLinks({ ...property, address_slug: null })!.url,
    /\/p\//,
  );
  assert.equal(propertyShareLinks({ ...property, status: "draft" }), null);
});

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
test("print route serves only published data and excludes itself from indexing", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://print-routes.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  const data = demoWorkspace();
  let result: unknown = {
    property: {
      ...data.properties[0],
      status: "published",
      address_slug: "public-home",
    },
    profile: data.profile,
  };
  globalThis.fetch = async () => Response.json(result);
  const { default: page, generateMetadata } =
    await import("../src/app/p/[slug]/print/page");
  const params = { params: Promise.resolve({ slug: "published-home" }) };
  const rendered = await page(params);
  assert.equal(rendered.props.property.status, "published");
  const meta = await generateMetadata(params);
  assert.deepEqual(meta.robots, { index: false, follow: false });
  assert.match(String(meta.alternates?.canonical), /\/public-home$/);
  for (const value of [
    null,
    {
      property: { ...data.properties[0], status: "draft" },
      profile: data.profile,
    },
  ]) {
    result = value;
    await assert.rejects(
      page(params),
      (error: any) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    assert.equal(
      (await generateMetadata(params)).title,
      "Property unavailable",
    );
  }
});
