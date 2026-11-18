import assert from "node:assert/strict";
import { test } from "node:test";
import { agentGuideProgress, guideSteps } from "../src/lib/agent-onboarding";
import { demoWorkspace } from "../src/lib/demo";

test("guide advances from saved contact details to a valid draft, then actual publication", () => {
  const data = demoWorkspace();
  data.properties = [];
  data.profile.phone = "";
  assert.equal(agentGuideProgress(data).step, 0);
  data.profile.phone = "0755436284";
  assert.equal(agentGuideProgress(data).step, 1);
  const draft = { ...demoWorkspace().properties[0], status: "draft" as const };
  data.properties = [{ ...draft, images: [] }];
  assert.equal(agentGuideProgress(data).step, 1);
  data.properties = [draft];
  assert.equal(agentGuideProgress(data).step, 2);
  // Entering checkout does not change a saved draft into a published listing.
  assert.equal(agentGuideProgress(data).property?.id, draft.id);
  data.properties[0].status = "published";
  assert.equal(agentGuideProgress(data).step, 3);
});

test("promotion is the optional guide stage immediately before messages", () => {
  assert.deepEqual(guideSteps.slice(-2), ["Promovarea", "Mesajele"]);
});
