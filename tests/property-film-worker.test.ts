import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  runPropertyFilm,
  filmDependencies,
} from "../src/lib/property-film-worker";
import type { FilmPlan } from "../src/lib/property-film-plan";

const original = { ...filmDependencies };
let job: {
  order_id: string;
  owner_id: string;
  property_id: string;
  attempts: number;
  lease_token: string;
  source: { images: string[] };
  montage_plan: FilmPlan | null;
  montage_next_shot: number;
};
let planned = 0,
  rendered = 0,
  assembled = 0,
  revoked = false;
let checkpoints: Record<string, unknown>[] = [],
  uploads: string[] = [],
  removals: string[] = [];
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://film-test.supabase.co";
  job = {
    order_id: "order",
    owner_id: "owner",
    property_id: "property",
    attempts: 1,
    lease_token: "lease",
    source: {
      images: ["front.jpg", "living.jpg"].map(
        (file) =>
          `https://film-test.supabase.co/storage/v1/object/public/property-images/owner/property/${file}`,
      ),
    },
    montage_plan: null,
    montage_next_shot: 0,
  };
  planned = rendered = assembled = 0;
  revoked = false;
  checkpoints = [];
  uploads = [];
  removals = [];
  filmDependencies.downloadPhoto = async (url) => Buffer.from(url);
  filmDependencies.photoFingerprint = async (bytes) =>
    (bytes.toString().includes("front") ? "a" : "b").repeat(64);
  filmDependencies.analyzeFilmPhotos = async () => {
    planned++;
    return [
      {
        index: 0,
        category: "exterior",
        strength: 5,
        aerial: false,
        evening: false,
      },
      {
        index: 1,
        category: "living",
        strength: 3,
        aerial: false,
        evening: false,
      },
    ];
  };
  filmDependencies.renderFilmShot = async () => {
    rendered++;
    return Buffer.from("segment");
  };
  filmDependencies.assembleFilm = async (segments) => {
    assembled++;
    assert.equal(segments.length, 2);
    return Buffer.from("complete-film");
  };
});
after(() => Object.assign(filmDependencies, original));
const admin = {
  rpc: async (name: string, body: Record<string, unknown>) => {
    if (name === "claim_property_montage")
      return { data: structuredClone(job), error: null };
    assert.equal(name, "checkpoint_property_montage");
    checkpoints.push(body);
    if (revoked) return { data: false, error: null };
    if (body.p_plan) job.montage_plan = body.p_plan as FilmPlan;
    if (body.p_next) job.montage_next_shot = Number(body.p_next);
    return { data: true, error: null };
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        uploads.push(`${bucket}/${path}`);
        return { error: null };
      },
      download: async () => ({ data: new Blob(["segment"]), error: null }),
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `https://film-test.supabase.co/storage/v1/object/public/${bucket}/${path}`,
        },
      }),
      remove: async (paths: string[]) => {
        removals.push(...paths.map((path) => `${bucket}/${path}`));
        return { error: null };
      },
    }),
  },
} as unknown as SupabaseClient;

test("film worker plans once, resumes one scene per invocation, and delivers only the assembled film", async () => {
  assert.equal(await runPropertyFilm(admin, "order"), "film_planned");
  assert.equal(uploads.length, 0);
  assert.equal(await runPropertyFilm(admin, "order"), "film_shot_saved");
  assert.equal(job.montage_next_shot, 1);
  assert.equal(await runPropertyFilm(admin, "order"), "film_shot_saved");
  assert.equal(
    uploads.filter((path) => path.startsWith("property-videos/")).length,
    0,
  );
  assert.equal(await runPropertyFilm(admin, "order"), "completed");
  assert.equal(planned, 1);
  assert.equal(rendered, 2);
  assert.equal(assembled, 1);
  assert.equal(
    uploads.filter((path) => path.startsWith("property-videos/")).length,
    1,
  );
  assert.equal(removals.length, 2);
  assert.ok(removals.every((path) => path.startsWith("property-video-work/")));
});
test("failed scene rendering leaves its index intact and the saved plan resumes without another analysis", async () => {
  await runPropertyFilm(admin, "order");
  const render = filmDependencies.renderFilmShot;
  filmDependencies.renderFilmShot = async () => {
    throw new Error("interrupted");
  };
  assert.equal(await runPropertyFilm(admin, "order"), "film_delayed");
  assert.equal(job.montage_next_shot, 0);
  assert.ok(checkpoints.at(-1)?.p_error);
  filmDependencies.renderFilmShot = render;
  assert.equal(await runPropertyFilm(admin, "order"), "film_shot_saved");
  assert.equal(planned, 1);
});
test("a stale completion cannot delete a film potentially delivered by another lease", async () => {
  await runPropertyFilm(admin, "order");
  await runPropertyFilm(admin, "order");
  await runPropertyFilm(admin, "order");
  revoked = true;
  assert.equal(await runPropertyFilm(admin, "order"), "revoked");
  assert.equal(removals.length, 0);
});
