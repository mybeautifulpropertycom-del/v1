import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lifecycle-tests.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.CRON_SECRET = "test-cron-secret-with-at-least-32-characters";
const actor = "11111111-1111-4111-8111-111111111111",
  target = "22222222-2222-4222-8222-222222222222",
  property = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  order = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let DELETE: typeof import("../src/app/api/admin/delete/route").POST;
let DOWNLOAD: typeof import("../src/app/api/video/download/route").POST;
let CLEANUP: typeof import("../src/app/api/maintenance/cleanup/route").POST;
let isAdmin = false,
  owned = true,
  published = true,
  access = true,
  targetAdmin = false,
  ready = true;
let url = "",
  calls: string[] = [],
  signed = 0;
const realFetch = globalThis.fetch;
before(async () => {
  ({ POST: DELETE } = await import("../src/app/api/admin/delete/route"));
  ({ POST: DOWNLOAD } = await import("../src/app/api/video/download/route"));
  ({ POST: CLEANUP } =
    await import("../src/app/api/maintenance/cleanup/route"));
});
beforeEach(() => {
  isAdmin = targetAdmin = false;
  owned = published = access = ready = true;
  signed = 0;
  calls = [];
  url = `https://lifecycle-tests.supabase.co/storage/v1/object/public/property-videos/${actor}/${order}/film.mp4`;
});
after(() => {
  globalThis.fetch = realFetch;
});
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
  assert.equal(u.hostname, "lifecycle-tests.supabase.co");
  calls.push(u.pathname);
  const authorization = new Headers(init?.headers).get("Authorization");
  if (u.pathname === "/auth/v1/user")
    return Response.json({ id: actor, email: "agent@example.com" });
  if (u.pathname === "/rest/v1/rpc/is_platform_admin")
    return Response.json(isAdmin);
  if (u.pathname === "/rest/v1/properties") {
    assert.equal(authorization, "Bearer user-token");
    assert.equal(u.searchParams.get("owner_id"), `eq.${actor}`);
    return Response.json(
      owned
        ? { id: property, status: published ? "published" : "draft" }
        : null,
    );
  }
  assert.equal(authorization, "Bearer test-service-key");
  if (u.pathname === "/rest/v1/platform_admins")
    return Response.json(targetAdmin ? { user_id: target } : null);
  if (u.pathname === "/rest/v1/rpc/property_has_live_access")
    return Response.json(access);
  if (u.pathname === "/rest/v1/property_video_jobs") {
    assert.equal(u.searchParams.get("owner_id"), `eq.${actor}`);
    assert.equal(u.searchParams.get("property_id"), `eq.${property}`);
    return Response.json({
      order_id: order,
      status: "completed",
      video_url: ready ? url : null,
    });
  }
  if (u.pathname.startsWith("/storage/v1/object/sign/property-videos/")) {
    signed++;
    return Response.json({
      signedURL: "/object/sign/property-videos/film.mp4?token=short-lived",
    });
  }
  if (
    u.pathname === "/rest/v1/rpc/admin_delete_account" ||
    u.pathname === "/rest/v1/rpc/admin_delete_property"
  ) {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_actor, actor);
    assert.equal(body.p_target, target);
    return Response.json(true);
  }
  if (u.pathname === `/auth/v1/admin/users/${target}`) {
    assert.equal(JSON.parse(String(init?.body)).ban_duration, "876000h");
    return Response.json({ id: target });
  }
  throw new Error(`Unexpected request ${u.pathname}`);
};
const request = (body: unknown, token = "user-token") =>
  new Request("https://app.example/api/test", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

test("downloads require authenticated ownership, publication and entitlement before issuing a URL", async () => {
  assert.equal(
    (await DOWNLOAD(request({ propertyId: property }, ""))).status,
    401,
  );
  assert.equal(calls.length, 0);
  owned = false;
  assert.equal((await DOWNLOAD(request({ propertyId: property }))).status, 404);
  assert.ok(!calls.includes("/rest/v1/rpc/property_has_live_access"));
  owned = true;
  published = false;
  assert.equal((await DOWNLOAD(request({ propertyId: property }))).status, 409);
  published = true;
  access = false;
  assert.equal((await DOWNLOAD(request({ propertyId: property }))).status, 403);
  access = true;
  ready = false;
  assert.equal((await DOWNLOAD(request({ propertyId: property }))).status, 409);
  assert.equal(signed, 0);
  ready = true;
  const response = await DOWNLOAD(request({ propertyId: property }));
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /short-lived/);
  assert.equal(signed, 1);
});
test("a stored video URL cannot sign external or another owner storage", async () => {
  for (const value of [
    "https://evil.example/film.mp4",
    url.replace(actor, target),
    url + "?redirect=elsewhere",
    url.replace("film.mp4", "../other.mp4"),
  ]) {
    url = value;
    assert.equal(
      (await DOWNLOAD(request({ propertyId: property }))).status,
      409,
    );
  }
  assert.equal(signed, 0);
});
test("only verified administrators may delete, administrator accounts are protected and actor cannot be forged", async () => {
  assert.equal(
    (await DELETE(request({ kind: "account", id: target }, ""))).status,
    401,
  );
  assert.equal(
    (await DELETE(request({ kind: "account", id: target }))).status,
    403,
  );
  assert.ok(!calls.some((p) => p.includes("admin_delete")));
  isAdmin = true;
  assert.equal(
    (await DELETE(request({ kind: "account", id: actor }))).status,
    409,
  );
  targetAdmin = true;
  assert.equal(
    (await DELETE(request({ kind: "account", id: target }))).status,
    409,
  );
  targetAdmin = false;
  const response = await DELETE(
    request({ kind: "account", id: target, actor: target }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).queued, true);
  assert.ok(calls.includes(`/auth/v1/admin/users/${target}`));
  assert.equal(
    (await DELETE(request({ kind: "property", id: target }))).status,
    200,
  );
});
test("anonymous and agent requests cannot invoke the retention worker", async () => {
  assert.equal((await CLEANUP(request({}, ""))).status, 401);
  assert.equal((await CLEANUP(request({}))).status, 401);
  assert.equal(calls.length, 0);
});
