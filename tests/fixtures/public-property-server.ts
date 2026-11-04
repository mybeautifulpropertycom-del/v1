// Test-server preload only. Production does not import this file.
// Fake Supabase responses let browser tests exercise server-rendered public routes.
import { demoWorkspace } from "../../src/lib/demo";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://browser-test.supabase.co")
    return originalFetch(input, init);
  if (url.pathname !== "/rest/v1/rpc/get_public_property")
    throw new Error(`Unexpected test-server Supabase request: ${url.pathname}`);
  const body = init?.body
    ? JSON.parse(String(init.body))
    : input instanceof Request
      ? await input.clone().json()
      : {};
  const mapTemplate = /^map-test-(editorial|minimal|panorama)$/.exec(
    body.property_slug || "",
  )?.[1];
  if (mapTemplate) {
    const sample = demoWorkspace();
    return Response.json({
      property: {
        ...sample.properties[0],
        template: mapTemplate,
        slug: body.property_slug,
        address_slug: body.property_slug,
        status: "published",
        location: "123 Test Street, Austin, TX, USA",
        google_place_id: "ChIJ-test-home",
      },
      profile: sample.profile,
    });
  }
  if (body.property_slug !== "print-test-home") return Response.json(null);
  const sample = demoWorkspace();
  return Response.json({
    property: {
      ...sample.properties[0],
      slug: "print-test-home",
      address_slug: "print-test-address",
      title: "A home ready to share",
      status: "published",
    },
    profile: sample.profile,
  });
};
