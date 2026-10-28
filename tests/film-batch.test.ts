import assert from "node:assert/strict";
import { test } from "node:test";
import { runFilmBatch } from "../src/lib/film-batch";

test("ready scenes and assembly continue without waiting for another cron tick", async () => {
  let index = 0,
    active = 0,
    peak = 0;
  const results = await runFilmBatch(
    async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return ++index <= 11 ? "ai_scene_edited" : "completed";
    },
    () => index * 2000,
  );
  assert.equal(results.length, 12);
  assert.equal(results.at(-1), "completed");
  assert.equal(
    peak,
    1,
    "Steps remain sequential, never parallel paid submissions",
  );
});

test("a saved scene can advance to the next submission, but pending generation is never retried", async () => {
  let calls = 0;
  const results = await runFilmBatch(
    async () => (++calls === 1 ? "ai_scene_saved" : "generating"),
    () => 0,
  );
  assert.deepEqual(results, ["ai_scene_saved", "generating"]);
  assert.equal(calls, 2);
});

test("rejection, ambiguous submission, lost lease and other non-progress states stop immediately", async () => {
  for (const result of [
    "failed",
    "uncertain",
    "delayed",
    "not_claimed",
    "revoked",
    "scene_unavailable",
    "provider_failed",
  ]) {
    let calls = 0;
    assert.deepEqual(
      await runFilmBatch(
        async () => {
          calls++;
          return result;
        },
        () => 0,
      ),
      [result],
    );
    assert.equal(calls, 1);
  }
});

test("time and step bounds leave work for the durable scheduler", async () => {
  let clock = 0;
  const timed = await runFilmBatch(
    async () => {
      clock += 31000;
      return "ai_scene_edited";
    },
    () => clock,
  );
  assert.equal(timed.length, 2);
  const bounded = await runFilmBatch(
    async () => "ai_scene_edited",
    () => 0,
  );
  assert.equal(bounded.length, 24);
});
