import { headers } from "next/headers";
import { getUnavailablePropertyOffer } from "@/lib/published-property";
import { UnavailablePage } from "./unavailable-page";

const titles = {
  sale: "Această proprietate a fost vândută.",
  rent: "Această proprietate a fost închiriată.",
};

export async function UnavailablePropertyPage() {
  const slug = (await headers()).get("x-property-404-slug");
  const offer = slug && (await getUnavailablePropertyOffer(slug));
  return <UnavailablePage title={offer ? titles[offer] : undefined} />;
}
