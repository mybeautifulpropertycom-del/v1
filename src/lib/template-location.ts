import { isUSAddress } from "./property-location";

export const TEMPLATE_LOCATION = "370 Ocean St, Santa Cruz, CA";

// Text search can return a nearby or similarly named place. Only use the
// template pin when Google confirms this exact street address.
export function isTemplateAddress(place: Parameters<typeof isUSAddress>[0]) {
  const component = (type: string) =>
    place.addressComponents
      ?.find((part) => part.types.includes(type))
      ?.shortText?.trim()
      .toLowerCase()
      .replace(/\./g, "");
  return (
    isUSAddress(place) &&
    component("street_number") === "370" &&
    ["ocean st", "ocean street"].includes(component("route") || "") &&
    component("locality") === "santa cruz" &&
    component("administrative_area_level_1") === "ca"
  );
}
