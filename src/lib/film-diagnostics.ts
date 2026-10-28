// Only application-owned messages may reach logs/UI. Never forward raw provider,
// image decoder or FFmpeg errors: they can contain credentials or signed URLs.
const safeMessages = new Set([
  "The film needs saved photographs.",
  "Invalid property photo.",
  "Use this property's saved photographs.",
  "A property photograph is unavailable or too large.",
  "Missing property photo.",
  "Property photograph exceeds 12 MB.",
  "Use a still photograph for the film.",
  "Photo preparation timed out.",
  "Photo ordering needs the server OpenAI configuration.",
  "Photo ordering is temporarily unavailable.",
  "Missing photo analysis.",
  "Photo analysis is too large.",
  "Photo analysis did not complete.",
  "The photo analysis is incomplete.",
  "Invalid photo analysis.",
  "Invalid film photographs.",
  "Invalid film plan.",
  "Invalid film shot.",
  "Film photographs do not match.",
  "A photograph changed after planning.",
  "Film progress could not be saved.",
  "Scene reservation failed.",
  "Scene request could not be bound.",
  "Scene request needs reconciliation.",
  "Missing configured scene output.",
  "BytePlus task status is unavailable.",
  "Video download is unavailable or exceeds 50 MB.",
  "Video download timed out.",
  "Video exceeds the 50 MB storage limit.",
  "The film renderer is unavailable.",
  "The film renderer could not finish this step.",
  "A saved scene is unavailable.",
  "A scene could not be saved.",
  "Film delivery failed.",
  "The film exceeds the video storage limit.",
  "Invalid film timeline.",
  "Invalid scene timing.",
]);

export function safeFilmDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    if (safeMessages.has(error.message)) return error.message;
    if (error.name === "TimeoutError" || error.name === "AbortError")
      return "The processing step timed out or was interrupted.";
  }
  return "The processing step could not complete.";
}
