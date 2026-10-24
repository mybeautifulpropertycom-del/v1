import type { Profile, Property, Workspace } from "./model";

export const demoProfile: Profile = {
  id: "demo-agent",
  name: "Olivia Bennett",
  email: "olivia@example.com",
  phone: "+1 (202) 555-0148",
  agency: "The Home Edit",
  bio: "I believe every home has a story. I help you find yours, with a thoughtful approach and an eye for the details that make a place feel like you.",
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
    title: "The Palm Residence",
    description:
      "A home where light finds its way into every corner. Tucked into a quiet Beverly Hills neighborhood, this contemporary residence brings together considered architecture and the warmth of everyday living.\n\nFloor-to-ceiling windows open the living space to a private garden, while the terrace becomes your favorite spot for slow mornings. Natural materials, generous proportions, and thoughtful finishes make this a truly special place to call home.",
    location: "Beverly Hills, CA",
    price: 2450000,
    currency: "USD",
    transaction: "sale",
    type: "House",
    area: 3250,
    area_unit: "sqft",
    bedrooms: 4,
    bathrooms: 3,
    amenities: [
      "Private garden",
      "Outdoor terrace",
      "Two-car garage",
      "Underfloor heating",
      "Central air",
      "Chef’s kitchen",
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
        title: "The Sunlit Loft",
        location: "Austin, TX",
        description:
          "An airy, thoughtfully designed condo in the heart of Austin. Warm textures and expansive windows create an inviting backdrop for everyday life.\n\nAn open kitchen flows into a generous living area, while the private balcony offers a quiet moment above the city. Two comfortable bedrooms and considered storage make this a home as practical as it is beautiful.",
        price: 875000,
        area: 1450,
        bedrooms: 2,
        bathrooms: 2,
        type: "Condo",
        template: "minimal",
        images: [photos.apartment, photos.bedroom, photos.kitchen],
        amenities: [
          "Private balcony",
          "Secure parking",
          "Central air",
          "Elevator",
        ],
      },
      {
        ...base,
        id: "demo-penthouse",
        slug: "above-the-ordinary-demo",
        title: "Above the Ordinary",
        location: "Miami, FL",
        description:
          "A considered retreat above the rhythm of Miami. Expansive living spaces, warm finishes, and a generous terrace invite you to enjoy a different perspective on city life.\n\nThree bedrooms, an open chef’s kitchen, and beautifully proportioned entertaining areas offer room for both quiet mornings and memorable evenings.",
        price: 1680000,
        area: 2280,
        bedrooms: 3,
        bathrooms: 3,
        type: "Penthouse",
        template: "panorama",
        status: "draft",
        images: [photos.interior, photos.apartment, photos.bedroom],
        amenities: [
          "Private terrace",
          "City views",
          "Secure parking",
          "Elevator",
        ],
      },
    ],
  };
}
