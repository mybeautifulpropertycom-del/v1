import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import { storyFixture } from "./story-fixture";
import { PropertyStoryError } from "../src/lib/property-story-error";
import {
  propertyStory,
  applyPropertyStory,
  editWebsiteCopy,
  hasWebsiteDescriptions,
  propertyStorySource,
  parseStoryDraft,
  savedPropertyStory,
} from "../src/lib/property-story";
import {
  approvedStoryImages,
  generatePropertyStory,
} from "../src/lib/property-story-generator";

test("each listing has factual copy and old photo analysis cannot survive changed facts or photos", () => {
  const [house, condo] = demoWorkspace().properties;
  const houseCopy = propertyStory(house);
  const condoCopy = propertyStory(condo);
  assert.notEqual(houseCopy.introBody, condoCopy.introBody);
  assert.match(condoCopy.heroIntro, /2 bedrooms · 2 bathrooms · 1,450 sq ft/);
  assert.match(condoCopy.settingBody, /Austin/);
  assert.equal(condoCopy.detailsTitle, "Private balcony");
  assert.ok(!JSON.stringify(condoCopy).includes("Private garden"));
  const stored = {
    ...condo,
    website_copy: {
      version: 1 as const,
      source: propertyStorySource(condo),
      content: { ...condoCopy, introTitle: "A bright new perspective." },
    },
  };
  assert.equal(
    savedPropertyStory(stored)?.introTitle,
    "A bright new perspective.",
  );
  for (const changed of [
    { ...stored, price: 900000 },
    { ...stored, amenities: ["Pool"] },
    { ...stored, images: [...stored.images].reverse() },
    { ...stored, description: "Updated description." },
  ])
    assert.equal(savedPropertyStory(changed), null);
  const land = propertyStory({ ...condo, type: "Land" });
  assert.doesNotMatch(land.heroIntro, /bedrooms|bathrooms/);
});

test("story output requires bounded text and exactly one caption per analyzed image", () => {
  const property = demoWorkspace().properties[0];
  const valid = {
    description: property.description,
    content: propertyStory(property),
  };
  assert.ok(parseStoryDraft(valid, property.images.length));
  for (const invalid of [
    null,
    { ...valid, description: "Short" },
    { ...valid, content: { ...valid.content, heroLine: "x".repeat(91) } },
    { ...valid, content: { ...valid.content, captions: ["Only one"] } },
    { ...valid, content: { ...valid.content, introBody: { html: "unsafe" } } },
  ])
    assert.equal(parseStoryDraft(invalid, property.images.length), null);
});

test("analysis accepts only this owner's saved property image paths in the configured storage", () => {
  const property = {
    ...demoWorkspace().properties[0],
    owner_id: "owner",
    id: "property",
    images: [
      "https://project.supabase.co/storage/v1/object/public/property-images/owner/property/photo.webp",
    ],
  };
  assert.deepEqual(
    approvedStoryImages(property, "https://project.supabase.co"),
    property.images,
  );
  const forty = {
    ...property,
    images: Array.from({ length: 40 }, (_, i) =>
      property.images[0].replace("photo.webp", `photo-${i}.webp`),
    ),
  };
  assert.equal(
    approvedStoryImages(forty, "https://project.supabase.co")?.length,
    40,
  );
  assert.equal(
    approvedStoryImages(
      { ...forty, images: [...forty.images, property.images[0]] },
      "https://project.supabase.co",
    ),
    null,
  );
  for (const image of [
    "http://127.0.0.1/private",
    "https://other.supabase.co/storage/v1/object/public/property-images/owner/property/photo.webp",
    property.images[0].replace("/owner/", "/other/"),
    property.images[0].replace("/property/photo", "/other/photo"),
    `${property.images[0]}?redirect=1`,
    property.images[0].replace("photo.webp", "../secret.webp"),
    "data:image/png;base64,test",
    property.images[0].replace("photo.webp", "photo.svg"),
  ])
    assert.equal(
      approvedStoryImages(
        { ...property, images: [image] },
        "https://project.supabase.co",
      ),
      null,
    );
});

test("vision request sends each image in order, excludes agent data, and validates the response", async () => {
  const property = demoWorkspace().properties[0];
  const draft = storyFixture(property);
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.store, false);
    const context = JSON.parse(request.input[0].content[0].text);
    assert.deepEqual(context.section_photographs.introBody, [1]);
    assert.deepEqual(context.section_photographs.description, [2]);
    assert.deepEqual(context.section_photographs.detailsBody, [3]);
    assert.deepEqual(
      request.input[0].content
        .slice(1)
        .map((x: { image_url: string }) => x.image_url),
      property.images,
    );
    assert.ok(!String(init?.body).includes("olivia@example.com"));
    assert.equal(request.text.format.strict, true);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(draft) }],
        },
      ],
    });
  };
  const result = await generatePropertyStory(property, property.images, {
    apiKey: "test",
    model: "test-model",
    fetcher,
  });
  assert.deepEqual(result, draft);
  assert.equal(calls, 1);
  for (const body of [
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "No" }] },
      ],
    },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "invalid json" }],
        },
      ],
    },
  ])
    await assert.rejects(
      generatePropertyStory(property, property.images, {
        apiKey: "test",
        model: "test",
        fetcher: async () => Response.json(body),
      }),
    );
});

test("generated paragraphs are limited to two sentences while saved older stories remain readable", async () => {
  const property = demoWorkspace().properties[0];
  const draft = storyFixture(property);
  const text =
    "A generous terrace opens up new possibilities. Arrange a tour to enjoy the setting in person.";
  draft.description = `${text} This extra sentence should not appear.`;
  draft.content.introBody = draft.description;
  const result = await generatePropertyStory(property, property.images, {
    apiKey: "test",
    model: "test",
    fetcher: async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(draft) }],
          },
        ],
      }),
  });
  assert.equal(result.description, text);
  assert.equal(result.content.introBody, text);
  const old = { ...draft.content } as Partial<typeof draft.content>;
  delete old.galleryBody;
  delete old.closingBody;
  assert.ok(
    parseStoryDraft(
      { description: property.description, content: old },
      property.images.length,
    ),
  );
});

test("provider failures identify credit, key, format, photo, model, and timeout issues without exposing raw messages", async () => {
  const property = demoWorkspace().properties[0];
  for (const [status, code, expected] of [
    [401, "invalid_api_key", "AI_AUTH"],
    [429, "insufficient_quota", "AI_CREDITS"],
    [429, "rate_limit_exceeded", "AI_BUSY"],
    [400, "invalid_json_schema", "AI_REQUEST"],
    [400, "invalid_image_url", "AI_PHOTO"],
    [404, "model_not_found", "AI_MODEL"],
    [504, "timeout", "AI_TIMEOUT"],
    [500, "server_error", "AI_UNAVAILABLE"],
  ] as const) {
    await assert.rejects(
      generatePropertyStory(property, property.images, {
        apiKey: "private-test-key",
        model: "test",
        fetcher: async () =>
          Response.json(
            {
              error: {
                code,
                message:
                  "Do not expose private-test-key or https://private.example/photo",
              },
            },
            { status },
          ),
      }),
      (error: unknown) => {
        assert.ok(error instanceof PropertyStoryError);
        assert.equal(error.code, expected);
        assert.ok(!error.message.includes("private-test-key"));
        assert.ok(!error.message.includes("private.example"));
        return true;
      },
    );
  }
  await assert.rejects(
    generatePropertyStory(property, property.images, {
      apiKey: "test",
      model: "test",
      signal: AbortSignal.abort(),
      fetcher: async () => {
        throw new DOMException("Aborted", "AbortError");
      },
    }),
    (error: unknown) =>
      error instanceof PropertyStoryError && error.code === "AI_TIMEOUT",
  );
});

test("section copy preserves agent notes, edits independently, and rejects stale results", () => {
  const property = demoWorkspace().properties[0];
  const draft = storyFixture(property);
  const prepared = applyPropertyStory(
    property,
    draft,
    propertyStorySource(property),
  );
  assert.equal(prepared.description, property.description);
  assert.equal(propertyStory(prepared).storyBody, draft.description);
  assert.ok(hasWebsiteDescriptions(prepared));
  const edited = editWebsiteCopy(
    prepared,
    "introBody",
    "A personal introduction. A reason to explore this home.",
  );
  assert.notEqual(propertyStory(edited).introBody, draft.content.introBody);
  assert.equal(propertyStory(edited).storyBody, draft.description);
  assert.equal(propertyStory(edited).detailsBody, draft.content.detailsBody);
  assert.equal(edited.description, property.description);
  assert.throws(() =>
    applyPropertyStory(
      { ...property, location: "Changed" },
      draft,
      propertyStorySource(property),
    ),
  );
  assert.equal(
    hasWebsiteDescriptions({
      ...prepared,
      images: [...prepared.images].reverse(),
    }),
    false,
  );
  const empty = { ...property, description: "" };
  const filled = applyPropertyStory(empty, draft, propertyStorySource(empty));
  assert.equal(filled.description, draft.description);
  assert.ok(hasWebsiteDescriptions(filled));
});
