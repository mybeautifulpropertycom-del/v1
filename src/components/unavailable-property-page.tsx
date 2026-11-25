import { headers } from "next/headers";
import {
  SOLD_PROPERTY_TITLE,
  unavailablePropertyTitle,
} from "@/lib/published-property";
import { UnavailablePage } from "./unavailable-page";

export async function UnavailablePropertyPage() {
  const slug = (await headers()).get("x-property-404-slug");
  const title = slug
    ? await unavailablePropertyTitle(slug)
    : SOLD_PROPERTY_TITLE;
  return <UnavailablePage title={title} />;
}
