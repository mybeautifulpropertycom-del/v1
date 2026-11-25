import { headers } from "next/headers";
import { unavailablePropertyTitle } from "@/lib/published-property";
import { UnavailablePage } from "./unavailable-page";

export async function UnavailablePropertyPage() {
  const slug = (await headers()).get("x-property-404-slug");
  const title = slug ? await unavailablePropertyTitle(slug) : undefined;
  return <UnavailablePage title={title} />;
}
