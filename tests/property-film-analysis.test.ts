import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { analyzeFilmPhotos } from "../src/lib/property-film-analysis";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
const observation = {
  category: "living",
  strength: 4,
  aerial: false,
  evening: false,
};
const response = (photos: unknown, status = "completed") =>
  Response.json({
    status,
    output: [
      { content: [{ type: "output_text", text: JSON.stringify({ photos }) }] },
    ],
  });

for (const count of [1, 16, 40]) {
  test(`${count} photographs have required, explicitly labeled analysis slots and stable indices`, async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const images = Array.from(
      { length: count },
      (_, i) => `https://photos.example/${i}.webp`,
    );
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const request = JSON.parse(String(init?.body));
      const keys = images.map((_, i) => `photo_${i}`);
      const schema = request.text.format.schema.properties.photos;
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, keys);
      assert.deepEqual(Object.keys(schema.properties), keys);
      assert.ok(request.max_output_tokens >= count * 160);
      assert.equal(request.store, false);
      images.forEach((url, i) => {
        assert.deepEqual(request.input[0].content[i * 2], {
          type: "input_text",
          text: `Photograph identifier: photo_${i}`,
        });
        assert.equal(request.input[0].content[i * 2 + 1].image_url, url);
      });
      // Reversed object ordering must not change the photograph association.
      return response(
        Object.fromEntries(
          [...keys].reverse().map((key) => [
            key,
            {
              ...observation,
              category: key === "photo_0" ? "exterior" : "living",
              evening: key === `photo_${count - 1}`,
            },
          ]),
        ),
      );
    };
    const result = await analyzeFilmPhotos(images);
    assert.equal(calls, 1, "No extra paid calls to repair the response");
    assert.deepEqual(
      result.map((item) => item.index),
      images.map((_, i) => i),
    );
    assert.equal(result[0].category, "exterior");
    assert.equal(result.at(-1)?.evening, true);
  });
}

test("missing photographs are rejected rather than filled with invented observations", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response({ photo_0: observation });
  };
  await assert.rejects(
    analyzeFilmPhotos([
      "https://photos.example/0.webp",
      "https://photos.example/1.webp",
    ]),
    /analysis is incomplete/,
  );
  assert.equal(calls, 1);
});

test("truncated model output and invalid observations stop before film planning", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => response({}, "incomplete");
  await assert.rejects(
    analyzeFilmPhotos(["https://photos.example/0.webp"]),
    /did not complete/,
  );
  globalThis.fetch = async () =>
    response({ photo_0: { ...observation, aerial: "true" } });
  await assert.rejects(
    analyzeFilmPhotos(["https://photos.example/0.webp"]),
    /Invalid photo analysis/,
  );
});
