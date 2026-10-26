import {
  videoConfiguration,
  videoDatabase,
} from "../src/lib/higgsfield-worker";
try {
  const profile = videoConfiguration();
  videoDatabase();
  console.log(
    `Higgsfield configuration is valid. Model endpoint: ${profile.endpoint}. Output: ${profile.output.kind} at ${profile.output.path}.`,
  );
  console.log(
    `Worker activation: ${process.env.HIGGSFIELD_ENABLED === "true" ? "enabled" : "disabled"}. No request was sent and no credits were used.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Higgsfield configuration is incomplete.",
  );
  process.exitCode = 1;
}
