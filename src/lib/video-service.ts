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
