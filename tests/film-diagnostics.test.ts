import assert from "node:assert/strict";
import { test } from "node:test";
import { safeFilmDiagnostic } from "../src/lib/film-diagnostics";
import { savedVideoProvider } from "../src/lib/video-service";

test("diagnostics retain known failures without leaking raw service or decoder errors", () => {
  assert.equal(
    safeFilmDiagnostic(new Error("Film progress could not be saved.")),
    "Film progress could not be saved.",
  );
  for (const error of [
    new Error("Bearer secret-token https://private.example?token=secret"),
    { message: "secret" },
    "secret",
  ])
    assert.equal(
      safeFilmDiagnostic(error),
      "The processing step could not complete.",
    );
});

test("provider display distinguishes saved provider from legacy engine and unassigned jobs", () => {
  assert.equal(
    savedVideoProvider({
      engine: "higgsfield-montage-v1",
      profile: { provider: "byteplus", endpoint: "seedance" },
    }),
    "BytePlus",
  );
  assert.equal(
    savedVideoProvider({
      engine: "higgsfield-montage-v1",
      profile: { endpoint: "minimax/hailuo" },
    }),
    "Higgsfield",
  );
  assert.equal(
    savedVideoProvider({ engine: "higgsfield-montage-v1" }),
    "Not assigned yet",
  );
  assert.equal(
    savedVideoProvider({ engine: "photo-montage-v1" }),
    "Original photographs",
  );
  assert.equal(savedVideoProvider(null), "Not assigned yet");
});
