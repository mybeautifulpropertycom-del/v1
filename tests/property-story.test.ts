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

function generatedResponse(draft: unknown) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(draft) }],
      },
    ],
  });
}

for (const imageCount of [30, 40]) {
  test(`${imageCount}-photo stories require every caption and restore photo order from keyed output`, async () => {
    const property = {
      ...demoWorkspace().properties[0],
      images: Array.from(
        { length: imageCount },
        (_, i) => `https://example.com/photo-${i}.webp`,
      ),
    };
    const draft = storyFixture(property);
    const captions = property.images.map(
      (_, i) => `Distinct visible detail ${i + 1}`,
    );
    let calls = 0;
    const result = await generatePropertyStory(property, property.images, {
      apiKey: "test",
      model: "test",
      fetcher: async (_url, init) => {
        calls++;
        const request = JSON.parse(String(init?.body));
        assert.equal(request.max_output_tokens, 3000 + imageCount * 100);
        const schema =
          request.text.format.schema.properties.content.properties.captions;
        assert.equal(schema.type, "object");
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual(
          schema.required,
          captions.map((_, i) => `photo_${i + 1}`),
        );
        assert.equal(Object.keys(schema.properties).length, imageCount);
        assert.equal(
          request.input[0].content.filter(
            (part: { type: string }) => part.type === "input_image",
          ).length,
          imageCount,
        );
        return generatedResponse({
          ...draft,
          content: {
            ...draft.content,
            captions: Object.fromEntries(
              captions
                .map((caption, i) => [`photo_${i + 1}`, caption])
                .reverse(),
            ),
          },
        });
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.content.captions, captions);
    assert.ok(parseStoryDraft(result, imageCount));
  });
}

test("overlong copy receives one text-only repair and valid fields cannot be overwritten", async () => {
  const property = demoWorkspace().properties[0];
  const valid = storyFixture(property);
  const invalid = structuredClone(valid);
  invalid.content.heroIntro =
    "The view offers a " + "generous ".repeat(35) + "space. Arrange a visit.";
  invalid.content.captions[0] = "A " + "bright ".repeat(25) + "room";
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const result = await generatePropertyStory(property, property.images, {
    apiKey: "test",
    model: "test",
    fetcher: async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      if (calls === 1) {
        signal = init?.signal;
        return generatedResponse(invalid);
      }
      assert.equal(calls, 2);
      assert.equal(init?.signal, signal);
      assert.equal(request.store, false);
      assert.equal(request.input[0].content.length, 1);
      assert.equal(request.input[0].content[0].type, "input_text");
      assert.ok(!JSON.stringify(request.input).includes("input_image"));
      const repair = structuredClone(valid);
      repair.content.introTitle = "Must not replace the original";
      repair.content.captions[1] = "Must not replace a valid caption";
      repair.description =
        "This is an unrelated replacement description. It must never replace the original valid text.";
      return generatedResponse(repair);
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, valid);
});

test("unsuccessful repair is bounded to two calls and reports only safe length diagnostics", async () => {
  const property = demoWorkspace().properties[0];
  const draft = storyFixture(property);
  draft.content.heroLine = "private-test-key ".repeat(10);
  let calls = 0;
  await assert.rejects(
    generatePropertyStory(property, property.images, {
      apiKey: "test",
      model: "test",
      fetcher: async () => {
        calls++;
        return generatedResponse(draft);
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof PropertyStoryError);
      assert.equal(error.code, "AI_OUTPUT");
      assert.deepEqual(error.outputDiagnostic, {
        reason: "field_length",
        field: "heroLine",
        actual: draft.content.heroLine.length,
        expected: 90,
      });
      assert.ok(!JSON.stringify(error).includes("private-test-key"));
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("missing captions, missing sections, refusals and truncated output never trigger a repair or accept partial copy", async () => {
  const property = demoWorkspace().properties[0];
  const draft = storyFixture(property);
  for (const [response, reason] of [
    [
      () =>
        generatedResponse({
          ...draft,
          content: {
            ...draft.content,
            captions: draft.content.captions.slice(1),
          },
        }),
      "caption_count",
    ],
    [
      () =>
        generatedResponse({
          ...draft,
          content: { ...draft.content, heroLine: undefined },
        }),
      "missing_field",
    ],
    [
      () =>
        generatedResponse({
          ...draft,
          content: {
            ...draft.content,
            heroLine: "x".repeat(100),
            captions: [],
          },
        }),
      "field_length",
    ],
    [
      () =>
        Response.json({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [],
        }),
      "token_limit",
    ],
    [
      () =>
        Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "private" }],
            },
          ],
        }),
      "refusal",
    ],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      generatePropertyStory(property, property.images, {
        apiKey: "test",
        model: "test",
        fetcher: async () => {
          calls++;
          return response();
        },
      }),
      (error: unknown) =>
        error instanceof PropertyStoryError &&
        error.outputDiagnostic?.reason === reason,
    );
    assert.equal(calls, 1);
  }
});
