/** Shared server-side switches. Legacy installations keep their existing flag. */
export function videoEnabled() {
  return (
    (process.env.PROPERTY_VIDEO_ENABLED?.trim() ||
      process.env.HIGGSFIELD_ENABLED) === "true"
  );
}
export function aiMontageMode() {
  return ["higgsfield-montage", "byteplus-montage"].includes(
    process.env.PROPERTY_VIDEO_MODE || "",
  );
}

/** The stored provider is authoritative; an old engine name is not a provider. */
export function savedVideoProvider(config: unknown): string {
  if (!config || typeof config !== "object") return "Neatribuit încă";
  const value = config as Record<string, unknown>;
  if (value.engine === "photo-montage-v1") return "Fotografii originale";
  const profile = (value.profile || (value.engine ? null : value)) as Record<
    string,
    unknown
  > | null;
  if (!profile?.endpoint) return "Neatribuit încă";
  return profile.provider === "byteplus" ? "BytePlus" : "Higgsfield";
}

export function configuredVideoProvider(): string {
  switch (process.env.PROPERTY_VIDEO_MODE) {
    case "byteplus-montage":
      return "BytePlus";
    case "photo-montage":
      return "Fotografii originale";
    default:
      return "Higgsfield";
  }
}
