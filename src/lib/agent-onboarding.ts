import { profileErrors, publicationErrors, type Workspace } from "./model";

export type GuideStatus = "active" | "dismissed" | "completed";
export const guideSteps = [
  "Profilul tău",
  "Proprietatea",
  "Publicarea",
  "Promovarea",
  "Mesajele",
] as const;

// Advance only from saved data, never from a click or an unfinished payment.
export function agentGuideProgress({ profile, properties }: Workspace) {
  const published = properties.find(
    (property) => property.status === "published",
  );
  if (published) return { step: 3, property: published };
  if (profileErrors(profile).length) return { step: 0, property: null };
  const ready = properties.find(
    (property) => publicationErrors(property, profile).length === 0,
  );
  if (ready) return { step: 2, property: ready };
  return { step: 1, property: properties.at(-1) ?? null };
}
