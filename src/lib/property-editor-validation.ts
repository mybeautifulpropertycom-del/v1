import { propertyErrors, type Property } from "./model";

// A draft can be saved at any point. Advancing through the editor requires
// the facts that a property presentation needs, even when the guide is closed.
export function propertyDetailsErrors(property: Property): string[] {
  const errors: string[] = [];
  if (property.title.trim().length < 5)
    errors.push("Adaugă un titlu de minimum 5 caractere.");
  if (!property.location.trim()) errors.push("Adaugă adresa proprietății.");
  if (!Number.isFinite(property.price) || property.price <= 0)
    errors.push("Adaugă un preț mai mare decât zero.");
  if (!Number.isFinite(property.area) || property.area <= 0)
    errors.push("Adaugă suprafața proprietății.");
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
