// Test-server preload only. Production does not import this file.
// Fake Supabase responses let browser tests exercise server-rendered public routes.
import { demoWorkspace } from "../../src/lib/demo";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://browser-test.supabase.co")
    return originalFetch(input, init);
  const body = init?.body
    ? JSON.parse(String(init.body))
    : input instanceof Request
      ? await input.clone().json()
      : {};
  if (url.pathname === "/rest/v1/rpc/find_public_listings") {
    const template = {
      ...demoWorkspace().properties[0],
      transaction: "sale",
      currency: "EUR",
      city: "București",
      city_slug: "bucuresti",
      kind: "apartamente",
      rooms: 2,
      bathrooms: 2,
      amenities: ["Terasă", "Parcare", "Lift", "Aer condiționat"],
      image: "/images/discovery/apartament.webp",
    };
    const inventory = [
      {
        ...template,
        price: 75000,
        slug: "print-test-home",
        address_slug: "print-test-home",
        title: "Apartament în buget",
        google_place_id: "ChIJ-search-bucharest-1",
      },
      {
        ...template,
        price: 110000,
        slug: "apartament-scump",
        title: "Apartament peste buget",
      },
      {
        ...template,
        price: 80000,
        slug: "apartament-trei-camere",
        title: "Apartament cu trei camere",
        rooms: 3,
        google_place_id: "ChIJ-search-bucharest-2",
        image: "/images/discovery/penthouse.webp",
      },
      {
        ...template,
        price: 80000,
        slug: "apartament-cluj",
        title: "Apartament în Cluj",
        city: "Cluj-Napoca",
        city_slug: "cluj-napoca",
      },
      ...[7, 8, 9].map((rooms) => ({
        ...template,
        price: 450000,
        slug: `casa-${rooms}-camere`,
        title: `Casă cu ${rooms} camere`,
        rooms,
        kind: "case",
        image: "/images/discovery/casa.webp",
        amenities: ["Grădină", "Terasă", "Garaj"],
        google_place_id: `ChIJ-search-house-${rooms}`,
      })),
      {
        ...template,
        price: 500,
        slug: "casa-inchiriere",
        title: "Casă de închiriat",
        rooms: 3,
        kind: "case",
        transaction: "rent",
      },
    ];
    const items = inventory.filter(
      (p) =>
        p.transaction === body.offer &&
        (!body.kind_filter || p.kind === body.kind_filter) &&
        (body.room_filter === -8
          ? p.rooms >= 8
          : !body.room_filter || p.rooms === body.room_filter) &&
        (!body.city_filter || p.city_slug === body.city_filter) &&
        (!body.budget_currency || p.currency === body.budget_currency) &&
        (body.budget_min == null || p.price >= body.budget_min) &&
        (body.budget_max == null || p.price <= body.budget_max),
    );
    return Response.json({
      total: items.length,
      city: body.city_filter === "bucuresti" ? "București" : null,
      items,
    });
  }
  if (url.pathname !== "/rest/v1/rpc/get_public_property")
    throw new Error(`Unexpected test-server Supabase request: ${url.pathname}`);
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
