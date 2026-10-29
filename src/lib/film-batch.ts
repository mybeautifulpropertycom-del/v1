const progress = new Set([
  "ai_film_planned",
  "ai_scene_saved",
  "ai_scene_edited",
]);

/** Continue ready work without waiting for the next scheduler tick. Each step
 * still acquires its own database lease. Never loop on a pending generation,
 * rejected request, error or lost lease. Leave room inside the 180s route limit
 * for the final step's download/render/storage operations.
 */
export async function runFilmBatch(
  step: () => Promise<string>,
  now: () => number = Date.now,
  deadline = now() + 60000,
): Promise<string[]> {
  const started = now();
  const results: string[] = [];
  for (let index = 0; index < 24; index++) {
    const result = await step();
    results.push(result);
    if (!progress.has(result) || now() - started >= 60000 || now() >= deadline)
      break;
  }
  return results;
}
