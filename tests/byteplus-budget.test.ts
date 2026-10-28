import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { bytePlusModel } from "../src/lib/byteplus-video";
import {
  bytePlusBudgetSettings,
  walkthroughShotLimit,
  timeWalkthrough,
  budgetForPlan,
  assertFilmBudget,
} from "../src/lib/byteplus-budget";
import {
  makeFilmPlan,
  type PhotoAnalysis,
} from "../src/lib/property-film-plan";
const originalEnv = { ...process.env };
after(() => {
  process.env = originalEnv;
});
beforeEach(() => {
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.05"; // Fixture, not a real provider quote.
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "15";
  delete process.env.BYTEPLUS_VIDEO_MODEL;
});
function planFor(count: number, duplicate = false) {
  const model = bytePlusModel();
  const images = Array.from(
    { length: count },
    (_, i) => `https://photos.example/${i}.webp`,
  );
  const fingerprints = images.map((_, i) =>
    (duplicate ? 0 : i).toString(16).padStart(64, "0"),
  );
  const observations: PhotoAnalysis[] = images.map((_, index) => ({
    index,
    category:
      index === 0 || index === count - 1
        ? "exterior"
        : (["living", "kitchen", "bedroom", "bathroom"][
            index % 4
          ] as PhotoAnalysis["category"]),
    strength: 4,
    aerial: false,
    evening: false,
  }));
  let plan = makeFilmPlan(
    images,
    observations,
    fingerprints,
    walkthroughShotLimit(new Set(fingerprints).size, model),
  );
  plan = timeWalkthrough(plan, new Set(fingerprints).size, model);
  plan.generationBudget = budgetForPlan(plan, model);
  return plan;
}
test("walkthrough duration follows useful photo count and keeps distinct exterior bookends", () => {
  for (const [count, scenes, duration] of [
    [15, 11, 30],
    [30, 21, 60],
    [40, 23, 80],
  ]) {
    const plan = planFor(count);
    assert.equal(plan.shots.length, scenes);
    assert.equal(plan.duration, duration);
    assert.equal(plan.shots[0].category, "exterior");
    assert.equal(plan.shots.at(-1)!.category, "exterior");
    assert.notEqual(plan.shots[0].image, plan.shots.at(-1)!.image);
    assertFilmBudget(plan, bytePlusModel());
  }
});
test("duplicate photographs cannot inflate duration or paid generation count", () => {
  const plan = planFor(40, true);
  assert.equal(plan.shots.length, 1);
  assert.equal(plan.duration, 2);
});
test("cost counts actual variable generated seconds, reserves 20%, and trims selection to budget", () => {
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.22";
  const plan = planFor(40);
  assert.equal(plan.shots.length, 23);
  assert.ok(plan.generationBudget!.estimatedGenerationUsd >= 11.88);
  assert.ok(plan.generationBudget!.estimatedGenerationUsd <= 12);
  assert.equal(plan.generationBudget!.reserveUsd, 3);
  assert.equal(plan.generationBudget!.generatedSeconds, plan.duration);
  assert.ok(
    plan.shots.every((shot) => shot.seconds! >= 2 && shot.seconds! <= 5),
  );
  assertFilmBudget(plan, bytePlusModel());
});
test("missing prices, invalid caps, or mismatched model settings fail closed", () => {
  delete process.env.BYTEPLUS_VIDEO_USD_PER_SECOND;
  assert.throws(
    () => bytePlusBudgetSettings(bytePlusModel()),
    /verified BytePlus/,
  );
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.05";
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "21";
  assert.throws(() => bytePlusBudgetSettings(bytePlusModel()), /at most/);
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "15";
  const model = bytePlusModel();
  model.input.resolution = "1080p";
  assert.throws(() => bytePlusBudgetSettings(model), /settings/);
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "9";
  assert.throws(
    () => bytePlusBudgetSettings(bytePlusModel()),
    /one generated scene/,
  );
});
test("price increases, smaller current budgets and missing approvals cannot bypass the saved cap", () => {
  const plan = planFor(40);
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.22";
  assert.throws(() => assertFilmBudget(plan, bytePlusModel()), /budget/);
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.05";
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "1";
  assert.throws(() => assertFilmBudget(plan, bytePlusModel()), /budget/);
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "15";
  delete plan.generationBudget;
  assert.throws(
    () => assertFilmBudget(plan, bytePlusModel()),
    /budget approval/,
  );
});

test("a $20 cap allows longer films without inflating shorter walkthroughs", () => {
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.28";
  const shorter = planFor(15);
  const longer = planFor(40);
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "20";
  const shortWithHigherCap = planFor(15);
  const longWithHigherCap = planFor(40);
  assert.equal(shortWithHigherCap.duration, 30);
  assert.equal(
    shortWithHigherCap.generationBudget!.estimatedGenerationUsd,
    shorter.generationBudget!.estimatedGenerationUsd,
  );
  assert.ok(longWithHigherCap.duration > longer.duration);
  assert.ok(
    longWithHigherCap.duration >= 55 && longWithHigherCap.duration <= 57,
  );
  assert.ok(longWithHigherCap.generationBudget!.estimatedGenerationUsd <= 16);
  assert.equal(longWithHigherCap.generationBudget!.reserveUsd, 4);
  assertFilmBudget(longWithHigherCap, bytePlusModel());
});
