import assert from "node:assert/strict";
import { after, test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  propertyGroupPost,
  propertyShareLinks,
  propertyShareSource,
} from "../src/lib/property-sharing";

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
  assert.equal(links.print, `/p/${property.slug}/tiparire`);
  assert.match(
    propertyShareLinks({ ...property, address_slug: null })!.url,
    /\/p\//,
  );
  assert.equal(propertyShareLinks({ ...property, status: "draft" }), null);
});

const originalFetch = globalThis.fetch;
test("group posts preserve exact saved facts and rental pricing without inventing payment periods", () => {
  const property = {
    ...demoWorkspace().properties[0],
    status: "published" as const,
    transaction: "rent" as const,
    address_slug: "locuinta-publicata",
    price: 1500,
    area: 87.5,
    currency: "RON" as const,
  };
  const post = propertyGroupPost(
    property,
    "O introducere bazată pe datele locuinței.",
  );
  assert.ok(post.includes("De închiriat"));
  assert.ok(post.includes("87,5 m²"));
  assert.ok(post.includes("1.500 RON"));
  assert.ok(post.includes(property.location));
  assert.ok(!post.includes("/lună"));
  assert.match(post, /\/locuinta-publicata$/);
  assert.equal(propertyGroupPost({ ...property, status: "draft" }), "");
  assert.notEqual(
    propertyShareSource(property),
    propertyShareSource({ ...property, address_slug: "alta-adresa" }),
  );
  assert.notEqual(
    propertyShareSource(property),
    propertyShareSource({ ...property, price: 1800 }),
  );
  assert.ok(
    !propertyGroupPost({ ...property, type: "Land" }).includes("dormitor"),
  );
});
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
    await import("../src/app/p/[slug]/tiparire/page");
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
      "Proprietate indisponibilă",
    );
  }
});
