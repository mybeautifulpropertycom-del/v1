import assert from "node:assert/strict";
import { test } from "node:test";
import { guidePlacement } from "../src/lib/guide-placement";

test("coachmarks fit narrow screens, viewport edges and the space above a mobile keyboard", () => {
  for (const viewport of [
    { left: 0, top: 0, width: 1440, height: 1000 },
    { left: 0, top: 0, width: 320, height: 650 },
    { left: 0, top: 140, width: 390, height: 280 },
  ]) {
    for (const top of [viewport.top + 5, viewport.top + viewport.height - 60]) {
      for (const left of [3, viewport.width - 50]) {
        const result = guidePlacement(
          {
            top,
            bottom: top + 40,
            left,
            right: left + 40,
            width: 40,
            height: 40,
          },
          220,
          viewport,
        );
        assert.equal(result.visible, true);
        assert.ok(result.x >= viewport.left + 12);
        assert.ok(
          result.x + result.width <= viewport.left + viewport.width - 12,
        );
        assert.ok(result.y >= viewport.top + 12);
        assert.ok(
          result.y + Math.min(220, result.maxHeight) <=
            viewport.top + viewport.height - 12,
        );
      }
    }
  }
  const hidden = guidePlacement(
    { top: -100, bottom: -40, left: 20, right: 120, width: 100, height: 60 },
    200,
    { top: 0, left: 0, width: 390, height: 800 },
  );
  assert.equal(hidden.visible, false);
});

test("a heading hint connects beside its red point on desktop and stays inside a narrow phone viewport", () => {
  const heading = {
    left: 360,
    right: 610,
    top: 410,
    bottom: 438,
    width: 250,
    height: 28,
  };
  const desktop = guidePlacement(
    heading,
    220,
    { left: 0, top: 0, width: 1440, height: 1000 },
    { besideHeading: true },
  );
  assert.ok(desktop.dotX > heading.right);
  assert.ok(desktop.x > desktop.dotX + 30);
  assert.equal(desktop.arrowX, desktop.x - 5);
  const mobile = guidePlacement(
    { ...heading, left: 45, right: 286, width: 241 },
    260,
    { left: 0, top: 0, width: 320, height: 650 },
    { besideHeading: true },
  );
  assert.ok(mobile.x >= 12);
  assert.ok(mobile.x + mobile.width <= 308);
  assert.ok(mobile.y + 260 <= 638);
  assert.equal(mobile.arrowX, null);
});
