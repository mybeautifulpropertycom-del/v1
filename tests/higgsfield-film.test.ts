import {
  bytePlusModel,
  BytePlusRejectedError,
} from "../src/lib/byteplus-video";
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
let queueFull = false,
  rateLimitDeferred = false;
let polls = 0,
  edited = 0;
beforeEach(() => {
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "0.05";
  process.env.PROPERTY_VIDEO_MAX_COST_USD = "15";
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
  queueFull = rateLimitDeferred = false;
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
  aiFilmDependencies.normalizeGeneratedClip = async (
    bytes,
    seconds,
    targetSeconds,
  ) => {
    assert.equal(bytes.toString(), "provider-motion");
    if (job.model_config.profile.provider === "byteplus") {
      assert.equal(
        targetSeconds,
        job.montage_plan.shots[job.montage_next_shot].seconds,
      );
      assert.equal(seconds, Math.max(4, targetSeconds!));
    } else assert.equal(seconds, 6);
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
  from: (table: string) => {
    assert.equal(table, "property_film_scenes");
    let index = -1;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        if (key === "shot_index") index = Number(value);
        return query;
      },
      maybeSingle: async () => ({
        data: scenes.get(index) || null,
        error: null,
      }),
    };
    return query;
  },
  rpc: async (name: string, body: Record<string, unknown>) => {
    if (name === "reject_byteplus_scene") {
      if (rateLimitDeferred && body.p_http === 429) {
        scenes.delete(Number(body.p_index));
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
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
    if (
      name === "reserve_property_film_scene" ||
      name === "reserve_byteplus_lookahead"
    ) {
      const index =
        name === "reserve_byteplus_lookahead"
          ? Number(body.p_index)
          : job.montage_next_shot;
      if (name === "reserve_byteplus_lookahead")
        assert.equal(index, job.montage_next_shot + 1);
      const existing = scenes.get(index);
      if (!existing && queueFull) return { data: null, error: null };
      if (existing)
        return { data: { ...existing, submit: false }, error: null };
      const row = {
        model_input: body.p_input,
        model_config: job.model_config.profile,
        request_id: null,
      };
      scenes.set(index, row);
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
  assert.match(String(checks.at(-1)?.p_error), /scene_delivery/);
  assert.doesNotMatch(String(checks.at(-1)?.p_error), /Download interrupted/);
  assert.equal(submissions.length, 1);
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(submissions.length, 1);
  assert.equal(polls, 2);
});

test("photo analysis failures identify the stage before any video submission", async () => {
  filmDependencies.analyzeFilmPhotos = async () => {
    throw new Error("Photo analysis did not complete.");
  };
  assert.equal(await runHiggsfieldFilm(admin, order), "delayed");
  assert.match(
    String(checks.at(-1)?.p_error),
    /photo_analysis.*Photo analysis did not complete/,
  );
  assert.equal(submissions.length, 0);
  assert.equal(scenes.size, 0);
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

function useBytePlus() {
  job.model_config.profile = bytePlusModel();
  aiFilmDependencies.submitGeneration = async () => {
    throw new Error("Unexpected Higgsfield submission");
  };
  aiFilmDependencies.generationStatus = async () => {
    throw new Error("Unexpected Higgsfield poll");
  };
  aiFilmDependencies.submitBytePlusGeneration = async (model, input) => {
    assert.equal(model, "dreamina-seedance-2-5-260628");
    submissions.push(input);
    if (timeout) throw new Error("Connection lost after acceptance");
    if (rejectCredits)
      throw new BytePlusRejectedError(
        "BytePlus rejected generation (HTTP 403).",
      );
    return { request_id: `cgt-${submissions.length}`, status: "queued" };
  };
  aiFilmDependencies.bytePlusGenerationStatus = async (id) => {
    polls++;
    return {
      request_id: id,
      status: "completed",
      content: { video_url: "https://cdn.example/byteplus-scene.mp4" },
      duration: Number(submissions[Number(id.split("-").at(-1)) - 1].duration),
      resolution: "720p",
    };
  };
}
test("BytePlus films preserve provider snapshots, resume delivery, and assemble without Higgsfield requests", async () => {
  useBytePlus();
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_film_planned");
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  process.env.PROPERTY_VIDEO_MODE = "higgsfield-montage";
  downloadFails = true;
  assert.equal(await runHiggsfieldFilm(admin, order), "delayed");
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(submissions.length, 1);
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(submissions.length, 2);
  const content = submissions[0].content as any[];
  assert.equal(content[1].image_url.url, job.source.images[0]);
  assert.equal(submissions[0].generate_audio, false);
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_edited");
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_edited");
  assert.equal(await runHiggsfieldFilm(admin, order), "completed");
  assert.equal(submissions.length, 2);
  delete process.env.PROPERTY_VIDEO_MODE;
});
for (const reason of ["timeout", "binding", "rejected"]) {
  test(`BytePlus ${reason} does not create duplicate paid scenes`, async () => {
    useBytePlus();
    await runHiggsfieldFilm(admin, order);
    timeout = reason === "timeout";
    failBinding = reason === "binding";
    rejectCredits = reason === "rejected";
    assert.equal(
      await runHiggsfieldFilm(admin, order),
      rejectCredits ? "failed" : "uncertain",
    );
    assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
    assert.equal(submissions.length, 1);
  });
}

test("BytePlus budget is saved with the plan and blocks new scenes after a price increase", async () => {
  useBytePlus();
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_film_planned");
  assert.equal(job.montage_plan.generationBudget.plannedScenes, 2);
  process.env.BYTEPLUS_VIDEO_USD_PER_SECOND = "4";
  assert.equal(await runHiggsfieldFilm(admin, order), "failed");
  assert.equal(submissions.length, 0);
  assert.equal(
    scenes.size,
    0,
    "Budget must be checked before a billable reservation",
  );
});

test("BytePlus returning a longer scene stops the film before further paid requests", async () => {
  useBytePlus();
  await runHiggsfieldFilm(admin, order);
  await runHiggsfieldFilm(admin, order);
  aiFilmDependencies.bytePlusGenerationStatus = async (id) => ({
    request_id: id,
    status: "completed",
    duration: 6,
    resolution: "720p",
    content: { video_url: "https://cdn.example/scene.mp4" },
  });
  assert.equal(await runHiggsfieldFilm(admin, order), "failed");
  assert.equal(submissions.length, 1);
  assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
  assert.equal(submissions.length, 1);
});

test("BytePlus scene rejection persists actionable HTTP, code and duration without another POST", async () => {
  useBytePlus();
  await runHiggsfieldFilm(admin, order);
  let calls = 0;
  aiFilmDependencies.submitBytePlusGeneration = async () => {
    calls++;
    throw new BytePlusRejectedError(
      "rejected",
      400,
      "InvalidParameter.Duration",
    );
  };
  assert.equal(await runHiggsfieldFilm(admin, order), "failed");
  assert.match(
    String(checks.at(-1)?.p_error),
    /BytePlus rejected scene 1 \(HTTP 400; code InvalidParameter.Duration; duration [2-5]s\)/,
  );
  assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
  assert.equal(calls, 1);
});

function useParallelBytePlus() {
  useBytePlus();
  job.byteplus_parallel = true;
  job.source.images.push(
    job.source.images[1].replace("back.jpg", "detail.jpg"),
    job.source.images[1].replace("back.jpg", "closing.jpg"),
  );
  filmDependencies.photoFingerprint = async (bytes) =>
    String(job.source.images.indexOf(bytes.toString())).repeat(64);
  filmDependencies.analyzeFilmPhotos = async () =>
    [0, 1, 2, 3].map((index) => ({
      index,
      category: index === 1 ? "living" : index === 2 ? "detail" : "exterior",
      strength: 5,
      aerial: false,
      evening: false,
    }));
}

test("BytePlus overlaps only the next scene, preserves shot order, and reuses accepted requests", async () => {
  useParallelBytePlus();
  await runHiggsfieldFilm(admin, order);
  const pollCompleted = aiFilmDependencies.bytePlusGenerationStatus;
  aiFilmDependencies.bytePlusGenerationStatus = async (id) => ({
    request_id: id,
    status: "in_progress",
  });
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(submissions.length, 2);
  assert.equal(scenes.get(0).request_id, "cgt-1");
  assert.equal(scenes.get(1).request_id, "cgt-2");
  assert.equal(job.montage_next_shot, 0);
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(
    submissions.length,
    2,
    "No third request while both slots are occupied",
  );
  aiFilmDependencies.bytePlusGenerationStatus = async (id) =>
    id === "cgt-2"
      ? { request_id: id, status: "in_progress" }
      : pollCompleted(id);
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(job.montage_next_shot, 1);
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(
    submissions.length,
    3,
    "Only refill after the first scene is safely saved",
  );
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(submissions.length, 3);
  aiFilmDependencies.bytePlusGenerationStatus = pollCompleted;
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(await runHiggsfieldFilm(admin, order), "ai_scene_saved");
  assert.equal(job.montage_next_shot, 3);
  assert.equal(submissions.length, 3);
});

for (const failure of ["timeout", "rejected", "binding"]) {
  test(`a ${failure} in the lookahead scene retains the accepted first task and never resubmits automatically`, async () => {
    useParallelBytePlus();
    await runHiggsfieldFilm(admin, order);
    const submit = aiFilmDependencies.submitBytePlusGeneration;
    aiFilmDependencies.submitBytePlusGeneration = async (endpoint, input) => {
      if (submissions.length === 1) {
        if (failure === "binding") {
          failBinding = true;
          return submit(endpoint, input);
        }
        submissions.push(input);
        if (failure === "rejected")
          throw new BytePlusRejectedError("Rejected", 429, "RateLimitExceeded");
        throw new Error("Connection lost after acceptance");
      }
      return submit(endpoint, input);
    };
    assert.equal(
      await runHiggsfieldFilm(admin, order),
      failure === "rejected" ? "failed" : "uncertain",
    );
    assert.equal(scenes.get(0).request_id, "cgt-1");
    assert.equal(scenes.get(1).request_id, null);
    if (failure === "rejected")
      assert.match(
        String(checks.at(-1)?.p_error),
        /rejected scene 2 .*HTTP 429/,
      );
    assert.equal(await runHiggsfieldFilm(admin, order), "not_claimed");
    assert.equal(submissions.length, 2);
  });
}

test("a full shared queue releases the job lease without failure or a provider submission", async () => {
  useBytePlus();
  await runHiggsfieldFilm(admin, order);
  queueFull = true;
  assert.equal(await runHiggsfieldFilm(admin, order), "waiting_for_capacity");
  assert.equal(submissions.length, 0);
  assert.equal(checks.at(-1)?.p_error, undefined);
  assert.equal(checks.at(-1)?.p_failure, undefined);
  queueFull = false;
  assert.equal(await runHiggsfieldFilm(admin, order), "generating");
  assert.equal(submissions.length, 1);
});

test("an explicit lookahead 429 keeps the accepted task and returns to the shared queue", async () => {
  useParallelBytePlus();
  await runHiggsfieldFilm(admin, order);
  rateLimitDeferred = true;
  const submit = aiFilmDependencies.submitBytePlusGeneration;
  aiFilmDependencies.submitBytePlusGeneration = async (endpoint, input) => {
    if (submissions.length === 1)
      throw new BytePlusRejectedError("rate limit", 429, "RateLimitExceeded");
    return submit(endpoint, input);
  };
  assert.equal(
    await runHiggsfieldFilm(admin, order),
    "waiting_for_provider_capacity",
  );
  assert.equal(scenes.get(0).request_id, "cgt-1");
  assert.equal(scenes.has(1), false);
  assert.equal(job.status, "processing");
  assert.equal(
    checks.some((value) => value.p_failure),
    false,
  );
});
