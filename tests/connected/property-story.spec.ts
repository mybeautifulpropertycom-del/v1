import { test, expect } from "@playwright/test";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";
import { workspace, id } from "./workspace-fixture";

test("save prepares separate section text, preserves notes, and reuses saved copy", async ({
  page,
}) => {
  const state = await workspace(page);
  const notes = state.property.description;
  const draft = storyFixture(state.property);
  let requests = 0;
  await page.route("**/api/property-story", async (route) => {
    requests++;
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    expect(route.request().postDataJSON()).toEqual({ propertyId: id });
    await route.fulfill({
      json: { draft, source: propertyStorySource(state.property) },
    });
  });
  await page.goto(`/dashboard/properties/${id}`);
  await expect(
    page.getByText("A story of its own.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Your changes are saved.", { exact: true }),
  ).toBeVisible();
  expect(state.property.description).toBe(notes);
  expect(state.property.website_copy?.description).toBe(draft.description);
  expect(state.property.website_copy?.content.introBody).toBe(
    draft.content.introBody,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".heritage-story-copy > p")).toHaveText(
    draft.description,
  );
  await expect(
    page.locator(".heritage-story .heritage-section-heading > p"),
  ).toHaveText(draft.content.introBody);
  await expect(
    page.locator(".heritage-gallery .heritage-section-heading > p"),
  ).toHaveText(draft.content.galleryBody);
  await expect(page.locator(".heritage-invitation-copy")).toHaveText(
    draft.content.closingBody,
  );
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Edit on page" }).click();
  const custom =
    "Your personal introduction belongs right here. Visit to explore this home for yourself.";
  await page
    .getByRole("textbox", { name: "Edit Introduction text", exact: true })
    .fill(custom);
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".heritage-story .heritage-section-heading > p"),
  ).toHaveText(custom);
  await expect(page.locator(".heritage-story-copy > p")).toHaveText(
    draft.description,
  );
  expect(requests).toBe(1);
  expect(state.property.description).toBe(notes);
  await page.getByRole("button", { name: "Edit on page" }).click();
  await page
    .getByRole("textbox", { name: "Edit property location", exact: true })
    .fill("Portland, OR");
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  expect(state.property.location).toBe("Portland, OR");
  expect(requests).toBe(2);
});

test("private preview prepares text in place but only saves it on request", async ({
  page,
}) => {
  const state = await workspace(page);
  const draft = storyFixture(state.property);
  const original = JSON.stringify(state.property);
  let requests = 0;
  await page.route("**/api/property-story", async (route) => {
    requests++;
    await route.fulfill({
      json: { draft, source: propertyStorySource(state.property) },
    });
  });
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".heritage-story-copy > p")).toHaveText(
    draft.description,
  );
  await expect(
    page.getByRole("button", { name: "Save website" }),
  ).toBeEnabled();
  expect(JSON.stringify(state.property)).toBe(original);
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  expect(state.property.website_copy?.description).toBe(draft.description);
  expect(state.property.status).toBe("draft");
  expect(requests).toBe(1);
});

test("choosing a design saves photos and prepares the page without a separate AI button", async ({
  page,
}) => {
  const state = await workspace(page);
  let requests = 0;
  await page.route("**/api/property-story", async (route) => {
    requests++;
    await route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    });
  });
  await page.goto(`/dashboard/properties/${id}`);
  await page.getByRole("button", { name: "Add your photos" }).click();
  await page.getByRole("button", { name: "Choose your design" }).click();
  await expect(page.locator(".template-choices")).toBeVisible();
  expect(state.property.website_copy?.description).toBe(
    storyFixture(state.property).description,
  );
  expect(requests).toBe(1);
});

test("missing configuration keeps the draft saved, shows a useful error, and allows manual continuation", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Automatic website descriptions are not enabled yet.",
        code: "AI_NOT_CONFIGURED",
      },
    }),
  );
  await page.goto(`/dashboard/properties/${id}`);
  await page.getByLabel(/^Location/).fill("Austin, TX");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor-error")).toContainText(
    "AI_NOT_CONFIGURED",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  expect(state.property.location).toBe("Austin, TX");
  expect(state.property.status).toBe("draft");
  expect(state.property.website_copy).toBeUndefined();
  await page.getByRole("button", { name: "Continue with my own text" }).click();
  await expect(
    page.getByText("Your changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add your photos" }).click();
  await page.getByRole("button", { name: "Choose your design" }).click();
  await expect(page.locator(".template-choices")).toBeVisible();
  await page
    .getByRole("button", { name: "Publish website", exact: true })
    .click();
  await expect(page.locator(".published-card")).toBeVisible();
  expect(state.property.status).toBe("published");
});

test("private preview reports a platform timeout and lets the agent retry in place", async ({
  page,
}) => {
  const state = await workspace(page);
  let requests = 0;
  await page.route("**/api/property-story", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({
          status: 504,
          contentType: "text/html",
          body: "<h1>Function timed out</h1>",
        })
      : route.fulfill({
          json: {
            draft: storyFixture(state.property),
            source: propertyStorySource(state.property),
          },
        });
  });
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".inline-edit-error")).toContainText(
    "Preparing the website took too long.",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".heritage-story-copy > p")).toHaveText(
    storyFixture(state.property).description,
  );
  expect(requests).toBe(2);
});

test("a network failure ends loading and preserves the saved listing", async ({
  page,
}) => {
  const state = await workspace(page);
  const original = JSON.stringify(state.property);
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".inline-edit-error")).toContainText(
    "We could not reach the writing service.",
  );
  await expect(
    page.getByRole("button", { name: "Edit on page" }),
  ).toBeEnabled();
  expect(JSON.stringify(state.property)).toBe(original);
});

test("Editorial displays independent introduction, main story and invitation paragraphs", async ({
  page,
}) => {
  const state = await workspace(page, { template: "editorial" });
  const draft = storyFixture(state.property);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: { draft, source: propertyStorySource(state.property) },
    }),
  );
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".estate-story-copy > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(page.locator(".estate-details-copy > p")).toHaveText(
    draft.description,
  );
  await expect(page.locator(".estate-invitation-copy")).toHaveText(
    draft.content.closingBody,
  );
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".estate-details-copy > p")).toHaveText(
    draft.description,
  );
});

test("Atelier uses separate photo-based paragraphs and saves inline section edits", async ({
  page,
}) => {
  const state = await workspace(page, { template: "panorama" });
  const draft = storyFixture(state.property);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      json: { draft, source: propertyStorySource(state.property) },
    }),
  );
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".atelier-intro-copy > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(page.locator(".atelier-story-copy > p")).toHaveText(
    draft.description,
  );
  await expect(page.locator(".atelier-details-copy > p")).toHaveCount(0);
  await page
    .getByRole("textbox", {
      name: "Edit Main section description",
      exact: true,
    })
    .fill(
      "A personal perspective on this home. Come and discover it for yourself.",
    );
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(
    page.getByText("Your website changes are saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".atelier-story-copy > p")).toHaveText(
    "A personal perspective on this home. Come and discover it for yourself.",
  );
  await expect(page.locator(".atelier-details-copy > p")).toHaveCount(0);
});
