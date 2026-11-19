import type { Profile, Property, Workspace } from "./model";

export const demoProfile: Profile = {
  id: "demo-agent",
  name: "Olivia Popescu",
  email: "olivia@example.com",
  phone: "+40 700 000 000",
  agency: "Agenția Demo",
  bio: "Acesta este un profil fictiv pentru demonstrație. Fiecare locuință are o poveste. Te ajut să o descoperi pe a ta, cu atenție la detaliile care fac un loc să se simtă ca acasă.",
};

export const photos = {
  villa: "/images/villa.jpg",
  interior: "/images/interior.jpg",
  apartment: "/images/apartment.jpg",
  bedroom: "/images/bedroom.jpg",
  kitchen: "/images/kitchen.jpg",
};

export function demoWorkspace(): Workspace {
  const now = new Date().toISOString();
  const base: Property = {
    id: "demo-villa",
    owner_id: "demo-agent",
    slug: "the-palm-residence-demo",
    title: "Vila cu grădină",
    description:
      "Proprietate fictivă pentru demonstrație. O locuință luminoasă, cu spații generoase și grădină privată. Arhitectura contemporană și materialele naturale creează o atmosferă primitoare. Ferestrele ample aduc lumină în zona de zi, iar terasa oferă spațiu pentru relaxare.",
    location: "București · exemplu fictiv",
    price: 2450000,
    currency: "EUR",
    transaction: "sale",
    type: "House",
    area: 302,
    area_unit: "sqm",
    bedrooms: 4,
    bathrooms: 3,
    amenities: [
      "Grădină privată",
      "Terasă exterioară",
      "Loc de parcare",
      "Încălzire în pardoseală",
      "Aer condiționat",
      "Bucătărie complet utilată",
    ],
    images: [photos.villa, photos.interior, photos.kitchen, photos.bedroom],
    template: "editorial",
    status: "published",
    created_at: now,
    updated_at: now,
  };
  return {
    profile: { ...demoProfile },
    properties: [
      base,
      {
        ...base,
        id: "demo-apartment",
        slug: "the-sunlit-loft-demo",
        title: "Apartamentul luminos",
        location: "Cluj-Napoca · exemplu fictiv",
        description:
          "Proprietate fictivă pentru demonstrație. Un apartament luminos, cu două dormitoare și un living generos. Bucătăria deschisă se continuă cu zona de zi, iar balconul privat oferă loc pentru relaxare. Spațiile de depozitare fac locuința practică și ușor de organizat.",
        price: 875000,
        area: 135,
        bedrooms: 2,
        bathrooms: 2,
        type: "Condo",
        template: "minimal",
        images: [photos.apartment, photos.bedroom, photos.kitchen],
        amenities: [
          "Balcon privat",
          "Parcare securizată",
          "Aer condiționat",
          "Lift",
        ],
      },
      {
        ...base,
        id: "demo-penthouse",
        slug: "above-the-ordinary-demo",
        title: "Penthouse cu terasă",
        location: "Constanța · exemplu fictiv",
        description:
          "Proprietate fictivă pentru demonstrație. Un penthouse cu trei dormitoare, living spațios și terasă generoasă. Bucătăria deschisă și zona de luat masa oferă loc pentru întâlniri cu prietenii, iar finisajele calde creează o atmosferă primitoare.",
        price: 1680000,
        area: 212,
        bedrooms: 3,
        bathrooms: 3,
        type: "Penthouse",
        template: "panorama",
        status: "draft",
        images: [photos.interior, photos.apartment, photos.bedroom],
        amenities: [
          "Terasă privată",
          "Vedere spre oraș",
          "Parcare securizată",
          "Lift",
        ],
      },
    ],
  };
}
