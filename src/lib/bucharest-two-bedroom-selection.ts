import { findPublicListings } from "./discover-listings";

export const bucharestTwoBedroomSelection = {
  path: "/selectii/apartamente-cu-2-dormitoare-de-vanzare-bucuresti",
  title: "Apartamente cu 2 dormitoare de vânzare în București",
  description:
    "Vezi apartamentele cu două dormitoare disponibile în București. Compară suprafața, compartimentarea și prețul, apoi deschide prezentarea pentru vizionare.",
} as const;

export function findBucharestTwoBedroomListings(page = 1) {
  return findPublicListings(
    "sale",
    "apartamente",
    2,
    "bucuresti",
    undefined,
    undefined,
    undefined,
    page,
  );
}
