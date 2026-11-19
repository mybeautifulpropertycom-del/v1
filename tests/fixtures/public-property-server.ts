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
  const priceCase =
    /^(rent|sale)-price-test-(editorial|minimal|panorama)-(apartment|house)$/.exec(
      body.property_slug || "",
    );
  if (priceCase) {
    const sample = demoWorkspace();
    return Response.json({
      videoIncluded: false,
      property: {
        ...sample.properties[0],
        slug: body.property_slug,
        address_slug: body.property_slug,
        template: priceCase[2],
        transaction: priceCase[1],
        type: priceCase[3] === "apartment" ? "Condo" : "House",
        currency: "EUR",
        price: 1500,
        status: "published",
      },
      profile: sample.profile,
    });
  }
  const photoOnly = /^photos-test-(editorial|minimal|panorama)$/.exec(
    body.property_slug || "",
  )?.[1];
  const mapTemplate =
    photoOnly ||
    /^map-test-(editorial|minimal|panorama|unmapped)$/.exec(
      body.property_slug || "",
    )?.[1];
  if (mapTemplate) {
    const sample = demoWorkspace();
    return Response.json({
      videoIncluded: !photoOnly,
      ...(photoOnly
        ? { film: { src: "/videos/template-property-tour.mp4" } }
        : {}),
      property: {
        ...sample.properties[0],
        template: mapTemplate === "unmapped" ? "editorial" : mapTemplate,
        slug: body.property_slug,
        address_slug: body.property_slug,
        status: "published",
        location:
          mapTemplate === "unmapped"
            ? "București · proprietate demonstrativă"
            : "Strada Test 123, București, România",
        google_place_id: mapTemplate === "unmapped" ? null : "ChIJ-test-home",
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
