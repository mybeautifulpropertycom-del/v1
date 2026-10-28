import { videoEnabled } from "../src/lib/video-service";
import {
  videoConfiguration,
  videoDatabase,
} from "../src/lib/higgsfield-worker";
try {
  const profile = videoConfiguration();
  videoDatabase();
  console.log(
    `Video configuration is valid. Model endpoint: ${profile.endpoint}. Output: ${profile.output.kind} at ${profile.output.path}.`,
  );
  console.log(`Workflow: ${process.env.PROPERTY_VIDEO_MODE || "single-clip"}.`);
  console.log(
    `Worker activation: ${videoEnabled() ? "enabled" : "disabled"}. No request was sent and no credits were used.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Video configuration is incomplete.",
  );
  process.exitCode = 1;
}
