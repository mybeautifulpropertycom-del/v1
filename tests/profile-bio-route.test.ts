import assert from "node:assert/strict";
import { test } from "node:test";

test("profile bio route uses the verified account, checks the output length and preserves quota on failure", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://profile-bio-tests.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  const { GET, POST } = await import("../src/app/api/profile-bio/route");
  const owner = "11111111-1111-4111-8111-111111111111";
  const output =
    "Îți prezint locuința și răspund la întrebări. Putem stabili împreună o vizionare.";
  let successful = 0,
    providerCalls = 0;
  let reservation: string | undefined;
  const versions: unknown[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      if (url.pathname === "/auth/v1/user")
        return headers.get("authorization") === "Bearer test-agent"
          ? Response.json({ id: owner, aud: "authenticated" })
          : Response.json({ message: "Invalid" }, { status: 401 });
      if (url.hostname === "profile-bio-tests.supabase.co") {
        assert.equal(headers.get("authorization"), "Bearer test-service-key");
        if (url.pathname.endsWith("/profile_bio_usage")) {
          assert.equal(url.searchParams.get("owner_id"), `eq.${owner}`);
          return Response.json([{ generations: successful }]);
        }
        const data = JSON.parse(String(init?.body));
        assert.equal(data.agent_id, owner);
        if (url.pathname.endsWith("/reserve_profile_bio")) {
          if (successful === 3) return Response.json(0);
          reservation = data.attempt_id;
          return Response.json(3 - successful);
        }
        assert.ok(url.pathname.endsWith("/finish_profile_bio"));
        assert.equal(data.attempt_id, reservation);
        if (data.succeeded) successful++;
        reservation = undefined;
        return Response.json(3 - successful);
      }
      assert.equal(url.href, "https://api.openai.com/v1/responses");
      const data = JSON.parse(String(init?.body));
      assert.equal(data.store, false);
      versions.push(JSON.parse(data.input));
      const bio = ++providerCalls === 1 ? "x".repeat(301) : output;
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ bio }) }],
          },
        ],
      });
    },
  );

  const request = (role?: string, token = "test-agent") =>
    new Request("http://localhost/api/profile-bio", {
      headers: { Authorization: `Bearer ${token}` },
      ...(role
        ? {
            method: "POST",
            body: JSON.stringify({
              role,
              agency: "Agenția Test",
              previousBio: "",
              owner: "spoofed",
            }),
          }
        : {}),
    });
  assert.equal((await POST(request("agent", "bad-token"))).status, 401);
  assert.equal((await POST(request("unknown"))).status, 400);
  assert.equal((await POST(request("owner"))).status, 502);
  assert.equal(reservation, undefined);
  assert.deepEqual(await (await GET(request())).json(), { remaining: 3 });
  assert.deepEqual(versions[0], { role: "owner", agency: "", previousBio: "" });
  for (const remaining of [2, 1, 0])
    assert.deepEqual(await (await POST(request("agent"))).json(), {
      bio: output,
      remaining,
    });
  assert.deepEqual(versions[1], {
    role: "agent",
    agency: "Agenția Test",
    previousBio: "",
  });
  assert.equal((await POST(request("agent"))).status, 429);
  assert.equal(providerCalls, 4);
});
