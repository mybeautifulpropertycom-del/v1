import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NotEnoughCreditsError } from "@higgsfield/client";
import {
  runHiggsfieldFilm,
  aiFilmDependencies,
  sceneGenerationInput,
} from "../src/lib/higgsfield-film-worker";
import { filmDependencies } from "../src/lib/property-film-worker";
import { configuredModel } from "../src/lib/higgsfield-models";
import {
  filmCallbackToken,
  filmCallbackUrl,
} from "../src/lib/higgsfield-security";
const original = { ...aiFilmDependencies },
  originalPhoto = { ...filmDependencies };
const owner = "11111111-1111-4111-8111-111111111111",
  order = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  property = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  generation = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let job: any,
  scenes: Map<number, any>,
  submissions: Record<string, unknown>[],
  uploads: string[],
  checks: Record<string, unknown>[];
let downloadFails = false,
  rejectCredits = false,
  timeout = false,
  failBinding = false,
  revoked = false;
let polls = 0,
  edited = 0;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://film-test.supabase.co";
  process.env.HIGGSFIELD_MODEL = "hailuo-2.3-standard";
  delete process.env.HIGGSFIELD_MODELS_JSON;
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.mybeautifulproperty.com";
  process.env.CRON_SECRET = "f".repeat(48);
  job = {
    order_id: order,
    property_id: property,
    owner_id: owner,
    status: "processing",
    provider_phase: "planning",
    attempts: 1,
    lease_token: "lease",
    montage_generation: generation,
    montage_plan: null,
    montage_next_shot: 0,
    montage_edited_shots: 0,
    source: {
      images: ["front.jpg", "back.jpg"].map(
        (name) =>
          `https://film-test.supabase.co/storage/v1/object/public/property-images/${owner}/${property}/${name}`,
      ),
    },
    model_config: {
      engine: "higgsfield-montage-v1",
      profile: configuredModel(),
    },
  };
  scenes = new Map();
  submissions = [];
  uploads = [];
  checks = [];
  polls = edited = 0;
  downloadFails = rejectCredits = timeout = failBinding = revoked = false;
  filmDependencies.downloadPhoto = async (url) => Buffer.from(url);
  filmDependencies.photoFingerprint = async (bytes) =>
    (bytes.toString().includes("front") ? "a" : "b").repeat(64);
  filmDependencies.analyzeFilmPhotos = async () =>
    [0, 1].map((index) => ({
      index,
      category: "exterior",
      strength: index === 0 ? 5 : 4,
      aerial: index === 1,
      evening: false,
    }));
  aiFilmDependencies.submitGeneration = async (endpoint, input, callback) => {
    assert.equal(endpoint, "minimax/hailuo-2.3/standard/image-to-video");
    assert.equal(input.duration, 6);
    assert.equal(input.prompt_optimizer, false);
    assert.ok(callback.includes("/api/higgsfield/film-webhook"));
    submissions.push(input);
    if (rejectCredits) throw new NotEnoughCreditsError();
    if (timeout) throw new Error("Network timeout after acceptance");
    return { request_id: `request_${submissions.length}`, status: "queued" };
  };
  aiFilmDependencies.generationStatus = async (id) => {
    polls++;
    return {
      request_id: id,
      status: "completed",
      video: { url: "https://media.example/scene.mp4" },
    };
  };
  aiFilmDependencies.downloadVideo = async () => {
    if (downloadFails) {
      downloadFails = false;
      throw new Error("Download interrupted");
    }
    return {
      bytes: Buffer.from("provider-motion"),
      type: "video/mp4",
      extension: "mp4",
    };
  };
  aiFilmDependencies.normalizeGeneratedClip = async (bytes, seconds) => {
    assert.equal(bytes.toString(), "provider-motion");
    assert.equal(seconds, 6);
    return Buffer.from("normalized-motion");
  };
  aiFilmDependencies.editGeneratedClip = async () => {
    edited++;
    return Buffer.from("edited-motion");
  };
  aiFilmDependencies.assembleFilm = async (clips, version) => {
    assert.equal(clips.length, 2);
    assert.equal(version, 2);
    return Buffer.from("finished-film");
  };
});
after(() => {
  Object.assign(aiFilmDependencies, original);
  Object.assign(filmDependencies, originalPhoto);
});
const admin = {
  rpc: async (name: string, body: Record<string, unknown>) => {
    if (name === "claim_property_ai_film")
      return {
        data:
          revoked ||
          job.status !== "processing" ||
          job.provider_phase === "uncertain"
            ? null
            : structuredClone(job),
        error: null,
      };
    if (name === "reserve_property_film_scene") {
      const existing = scenes.get(job.montage_next_shot);
      if (existing)
        return { data: { ...existing, submit: false }, error: null };
      const row = {
        model_input: body.p_input,
        model_config: job.model_config.profile,
        request_id: null,
      };
      scenes.set(job.montage_next_shot, row);
      return { data: { ...row, submit: true }, error: null };
    }
    if (name === "bind_property_film_scene") {
      if (failBinding)
        return { data: null, error: { message: "DB unavailable" } };
      scenes.get(Number(body.p_index)).request_id = body.p_request;
      return { data: !revoked, error: null };
    }
    assert.equal(name, "checkpoint_property_ai_film");
    checks.push(body);
    if (revoked) return { data: false, error: null };
    if (body.p_plan) job.montage_plan = body.p_plan;
    if (body.p_scene !== undefined) job.montage_next_shot++;
    if (body.p_edit !== undefined) job.montage_edited_shots++;
    if (body.p_failure === "uncertain") job.provider_phase = "uncertain";
    if (body.p_failure === "failed") job.status = "failed";
    if (body.p_url) {
      job.status = "completed";
      job.video_url = body.p_url;
    }
    return { data: true, error: null };
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        uploads.push(`${bucket}/${path}`);
        return { error: null };
      },
      download: async () => ({ data: new Blob(["saved-scene"]), error: null }),
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `https://film-test.supabase.co/storage/v1/object/public/${bucket}/${path}`,
        },
      }),
      remove: async () => ({ error: null }),
    }),
  },
} as unknown as SupabaseClient;

test("each distinct image receives one Higgsfield request, then generated clips are edited and assembled", async () => {
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_film_planned");
  for (let i = 0; i < 2; i++) {
    assert.equal(await runHiggsfieldFilm(admin, order), "generating");
    assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  }
  assert.equal(submissions.length, 2);
  assert.equal(polls, 2);
  assert.equal(submissions[0].image_url, job.source.images[0]);
  assert.equal(submissions[1].image_url, job.source.images[1]);
  assert.match(String(submissions[0].prompt), /no shake/);
  assert.match(String(submissions[1].prompt), /aerial glide/);
  assert.equal(
    uploads.filter((path) => path.startsWith("property-videos/")).length,
    0,
    "Only a complete film becomes public",
  );
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_edited");
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_edited");
  assert.equal(await runHiggsfieldFilm(admin, order), "completed");
  assert.equal(edited, 2);
  assert.equal(submissions.length, 2);
  assert.ok(uploads.every((path) => path.includes(generation)));
});
test("download/render retries reuse saved provider IDs rather than purchasing another generation", async () => {
  await runHiggsfieldFilm(admin, order);
  await runHiggsfieldFilm(admin, order);
  downloadFails = true;
  assert.equal(await runHiggsfieldFilm(admin, order), "delayed");
  assert.equal(submissions.length, 1);
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(submissions.length, 1);
  assert.equal(polls, 2);
});
for (const failure of ["timeout", "binding"]) {
  test(`ambiguous ${failure} stops submission until the original request is reconciled`, async () => {
    await runHiggsfieldFilm(admin, order);
    timeout = failure === "timeout";
    failBinding = failure === "binding";
    assert.equal(await runHiggsfieldFilm(admin, order), "uncertain");
    assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
    assert.equal(submissions.length, 1);
    // A verified callback recovers the already-created request.
    scenes.get(0).request_id = "request_1";
    job.provider_phase = "generating";
    timeout = failBinding = false;
    assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
    assert.equal(submissions.length, 1);
  });
}
test("insufficient API credit and revoked access do not trigger automatic paid resubmissions", async () => {
  await runHiggsfieldFilm(admin, order);
  rejectCredits = true;
  assert.equal(await runHiggsfieldFilm(admin, order), "failed");
  assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
  assert.equal(submissions.length, 1);
  job.status = "processing";
  revoked = true;
  assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
  assert.equal(submissions.length, 1);
});
test("callback identities are bound to both generation and scene, and prompts preserve the photographed lighting", () => {
  assert.notEqual(
    filmCallbackToken(order, generation, 0),
    filmCallbackToken(order, generation, 1),
  );
  assert.notEqual(
    filmCallbackToken(order, generation, 0),
    filmCallbackToken(order, property, 0),
  );
  assert.equal(
    new URL(filmCallbackUrl(order, generation, 0)).searchParams.get("index"),
    "0",
  );
  const input = sceneGenerationInput(configuredModel(), {
    image: job.source.images[0],
    index: 0,
    category: "living",
    strength: 4,
    aerial: false,
    evening: true,
    fingerprint: "a".repeat(64),
    motion: "push",
  });
  assert.match(String(input.prompt), /existing evening lighting/);
  assert.match(String(input.prompt), /Do not reveal unseen areas/);
});
