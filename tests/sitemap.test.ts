import assert from "node:assert/strict";
import { test, after } from "node:test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sitemap-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

test("sitemaps paginate canonical URLs, exclude private routes and fail safely on database errors", async () => {
  const { GET: index } = await import("../src/app/sitemap.xml/route");
  const { GET: page } = await import("../src/app/sitemap.xml/[page]/route");
  const { xmlEscape } = await import("../src/lib/sitemap");
  let fail = false;
  globalThis.fetch = async (_url, init) => {
    if (fail) return Response.json({ message: "missing RPC" }, { status: 404 });
    const { sitemap_page } = JSON.parse(String(init?.body));
    return Response.json({
      total: 1001,
      items: [
        {
          slug: "original-home",
          address_slug: sitemap_page === 0 ? "palm-drive" : null,
          updated_at: "2026-10-31T12:00:00Z",
        },
      ],
    });
  };
  const response = await index();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type")!, /application\/xml/);
  const xml = await response.text();
  assert.match(xml, /properties-1.xml/);
  assert.match(xml, /properties-2.xml/);
  assert.doesNotMatch(xml, /properties-3.xml|dashboard|preview|login|register/);
  const getPage = (file: string) =>
    page(new Request("https://example.com"), {
      params: Promise.resolve({ page: file }),
    });
  const first = await (await getPage("properties-1.xml")).text();
  assert.match(first, /\/palm-drive<\/loc>/);
  assert.doesNotMatch(first, /original-home/);
  assert.match(first, /2026-10-31T12:00:00.000Z/);
  assert.match(
    await (await getPage("properties-2.xml")).text(),
    /\/p\/original-home/,
  );
  assert.equal((await getPage("properties-3.xml")).status, 404);
  assert.equal((await getPage("properties-0.xml")).status, 404);
  assert.equal((await getPage("invalid.xml")).status, 404);
  assert.equal(xmlEscape("<&>\"'"), "&lt;&amp;&gt;&quot;&apos;");
  fail = true;
  assert.equal((await index()).status, 503);
  assert.equal((await getPage("properties-1.xml")).status, 503);
  assert.equal((await getPage("main.xml")).status, 200);
});
