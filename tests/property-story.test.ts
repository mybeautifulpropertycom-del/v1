import assert from "node:assert/strict";
import { test } from "node:test";
import { demoWorkspace } from "../src/lib/demo";
import {
  propertyStory,
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
  assert.match(condoCopy.settingTitle, /Austin/);
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
  const draft = {
    description: property.description,
    content: propertyStory(property),
  };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.store, false);
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
