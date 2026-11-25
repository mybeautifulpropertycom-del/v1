import { propertyErrors, type Property } from "./model";
import { propertyGuideIssues } from "./property-guide";

// A draft can be saved at any point. Advancing through the editor requires
// the facts that a property presentation needs, even when the guide is closed.
export function propertyDetailsErrors(
  property: Property,
  saved?: Property,
): string[] {
  const issues = propertyGuideIssues(property);
  const errors = [
    issues.title,
    issues.location,
    issues.price,
    issues.area,
  ].filter((issue): issue is string => Boolean(issue));
  return [...new Set([...errors, ...propertyErrors(property, saved)])];
}

export function propertyStepRequirement(
  property: Property,
  step: number,
  saved?: Property,
) {
  return (
    propertyDetailsErrors(property, saved)[0] ||
    (step > 0 && !property.images.length
      ? "Adaugă cel puțin o fotografie."
      : "")
  );
}
