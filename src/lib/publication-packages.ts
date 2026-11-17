// Shared labels; the server and database independently enforce the tariff.
export const publicationPackages = {
  photos: {
    id: "photos",
    name: "Prezentare cu fotografii",
    amount: 14900,
    price: 149,
    includesVideo: false,
    description: "Prezentarea proprietății, cu fotografii, detalii și hartă.",
  },
  video: {
    id: "video",
    name: "Prezentare cu fotografii și videoclip",
    amount: 24900,
    price: 249,
    includesVideo: true,
    description:
      "Prezentarea proprietății și un videoclip din fotografiile tale.",
  },
} as const;

export type PublicationPackage = keyof typeof publicationPackages;

export function isPublicationPackage(
  value: unknown,
): value is PublicationPackage {
  return value === "photos" || value === "video";
}

export function orderPackage(order: {
  includes_video?: boolean;
}): PublicationPackage {
  // Orders created before this feature all included the film.
  return order.includes_video === false ? "photos" : "video";
}
