// Fixed demonstration address supplied by the user. Resolve through Google;
// sample photographs do not establish the actual appearance of this address.
export const TEMPLATE_LOCATION = "Strada Sipca Numar 9, București";
export const TEMPLATE_LOCATION_QUERY = "Strada Sipca 9, București, România";

type AddressComponent = {
  types: string[];
  shortText: string | null;
  longText?: string | null;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function isTemplateAddress(place: {
  addressComponents?: AddressComponent[];
}) {
  const components = place.addressComponents || [];
  const matches = (type: string, check: (value: string) => boolean) =>
    components.some(
      (component) =>
        component.types.includes(type) &&
        [component.shortText, component.longText].some(
          (value) => value != null && check(normalize(value)),
        ),
    );
  return (
    matches("country", (value) => value === "ro") &&
    matches("street_number", (value) => value === "9") &&
    matches("route", (value) =>
      ["sipca", "stradasipca", "strsipca"].includes(value),
    ) &&
    [
      "locality",
      "postal_town",
      "administrative_area_level_1",
      "administrative_area_level_2",
    ].some((type) =>
      matches(type, (value) =>
        ["bucuresti", "bucharest", "municipiulbucuresti"].includes(value),
      ),
    )
  );
}
