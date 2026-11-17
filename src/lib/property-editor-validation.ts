import {
  isReservedPropertyAddress,
  propertyErrors,
  type Property,
} from "./model";

export function propertyDetailFieldErrors(property: Property) {
  return {
    title:
      property.title.trim().length < 5
        ? "Adaugă un titlu de minimum 5 caractere."
        : property.title.length > 160
          ? "Titlul poate avea maximum 160 de caractere."
          : null,
    location: !property.location.trim()
      ? "Adaugă adresa proprietății."
      : isReservedPropertyAddress(property.location) ||
          property.location.length > 200
        ? "Adaugă adresa completă a proprietății, inclusiv strada și numărul."
        : null,
    price:
      !Number.isFinite(property.price) ||
      property.price <= 0 ||
      property.price > 999999999999
        ? "Adaugă un preț mai mare decât zero."
        : null,
    area:
      !Number.isFinite(property.area) ||
      property.area <= 0 ||
      property.area > 999999999
        ? "Adaugă suprafața proprietății."
        : null,
  };
}

// A draft can be saved at any point. Advancing through the editor requires
// the facts that a property presentation needs, even when the guide is closed.
export function propertyDetailsErrors(property: Property): string[] {
  const errors = Object.values(propertyDetailFieldErrors(property)).filter(
    (error): error is string => Boolean(error),
  );
  return [...new Set([...errors, ...propertyErrors(property)])];
}

export function propertyStepRequirement(property: Property, step: number) {
  return (
    propertyDetailsErrors(property)[0] ||
    (step > 0 && !property.images.length
      ? "Adaugă cel puțin o fotografie."
      : "")
  );
}
