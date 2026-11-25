import { propertyInvitation } from "../../src/lib/presentation-copy";
import { test, expect } from "@playwright/test";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";
import { workspace, id } from "./workspace-fixture";

test("facilities are saved before generation and refresh the second section without written notes", async ({
  page,
}) => {
  const state = await workspace(page, {
    template: "panorama",
    description: "",
    amenities: [],
  });
  const copy = [
    "Imaginează-ți o după-amiază de vară lângă piscină. Vino să vezi cum ți-ai petrece zilele aici.",
    "Imaginează-ți o dimineață în care îți bei cafeaua pe balcon, înainte să înceapă ziua.",
  ];
  let requests = 0;
  await page.route("**/api/property-story", async (route) => {
    expect(state.property.amenities).toEqual([
      requests === 0 ? "Piscină" : "Balcon",
    ]);
    if (requests === 0) expect(state.property.description).toBe("");
    const draft = storyFixture(state.property);
    draft.content.introBody = copy[requests++];
    await route.fulfill({
      json: { draft, source: propertyStorySource(state.property) },
    });
  });
  for (let i = 0; i < copy.length; i++) {
    await page.goto(`/panou/proprietati/${id}`);
    await expect(
      page.getByRole("heading", { name: "Facilități și dotări" }),
    ).toBeVisible();
    await expect(
      page.locator(".form-section-title + .guide-facilities").getByRole(
        "button",
        { name: "Piscină", exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Descriere", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Piscină", exact: true }).click();
    if (i === 1)
      await page.getByRole("button", { name: "Balcon", exact: true }).click();
    await page
      .getByRole("button", { name: "Salvează modificările", exact: true })
      .click();
    await expect(
      page.getByText("Modificările au fost salvate.", { exact: true }),
    ).toBeVisible();
    expect(state.property.description.length).toBeGreaterThanOrEqual(30);
    await page.goto(`/previzualizare/${id}`);
    await expect(page.locator(".atelier-story-copy > p")).toHaveText(copy[i]);
    expect(requests).toBe(i + 1);
  }
});

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
  await page.goto(`/panou/proprietati/${id}`);
  await expect(
    page.getByText("A story of its own.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(
    page.getByText("Modificările au fost salvate.", { exact: true }),
  ).toBeVisible();
  expect(state.property.description).toBe(notes);
  expect(state.property.website_copy?.description).toBe(draft.description);
  expect(state.property.website_copy?.content.introBody).toBe(
    draft.content.introBody,
  );
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvează modificările", exact: true }),
  ).toBeEnabled();
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".heritage-story-text > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(
    page.locator(".heritage-story > .heritage-section-heading"),
  ).toHaveCount(0);
  await expect(
    page.locator(".heritage-gallery .heritage-section-heading > p"),
  ).toHaveText(draft.content.galleryBody);
  await expect(page.locator(".heritage-invitation-copy")).toHaveText(
    propertyInvitation(state.property.location),
  );
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Editează pe pagină" }).click();
  const custom =
    "Your personal introduction belongs right here. Visit to explore this home for yourself.";
  await page
    .getByRole("textbox", {
      name: "Editează Textul introducerii",
      exact: true,
    })
    .fill(custom);
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".heritage-story-text > p")).toHaveText(custom);
  expect(requests).toBe(1);
  expect(state.property.description).toBe(notes);
  await page.getByRole("button", { name: "Editează pe pagină" }).click();
  await page
    .getByRole("textbox", { name: "Editează adresa proprietății", exact: true })
    .fill("Portland, OR");
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
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
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".heritage-story-text > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(
    page.getByRole("button", { name: "Salvează site-ul" }),
  ).toBeEnabled();
  expect(JSON.stringify(state.property)).toBe(original);
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
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
  await page.goto(`/panou/proprietati/${id}`);
  await page.getByRole("button", { name: "Adaugă fotografiile" }).click();
  await page.getByRole("button", { name: "Alege designul" }).click();
  await expect(page.locator(".template-choices")).toBeVisible();
  expect(state.property.website_copy?.description).toBe(
    storyFixture(state.property).description,
  );
  expect(requests).toBe(1);
});

test("missing configuration keeps the draft saved, shows a useful error, and allows manual continuation", async ({
  page,
}) => {
  const state = await workspace(page, { description: "" });
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Automatic website descriptions are not enabled yet.",
        code: "AI_NOT_CONFIGURED",
      },
    }),
  );
  await page.goto(`/panou/proprietati/${id}`);
  await page.getByLabel(/^Adresă/).fill("Austin, TX");
  await page.getByRole("button", { name: "Adaugă fotografiile" }).click();
  await page.getByRole("button", { name: "Alege designul" }).click();
  await expect(page.locator(".editor-error")).toContainText(
    "AI_NOT_CONFIGURED",
  );
  await expect(
    page.getByRole("button", { name: "Salvează modificările", exact: true }),
  ).toBeEnabled();
  expect(state.property.location).toBe("Austin, TX");
  expect(state.property.status).toBe("draft");
  expect(state.property.website_copy).toBeUndefined();
  await page
    .getByRole("button", { name: "Continuă cu textul de bază" })
    .click();
  await expect(page.locator(".template-choices")).toBeVisible();
  await page
    .getByRole("button", { name: "Deschide editorul site-ului", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/previzualizare/${id}$`));
  await expect(page.locator(".inline-edit-toolbar")).toBeVisible();
  expect(state.property.status).toBe("draft");
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
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".inline-edit-error")).toContainText(
    "Pregătirea site-ului a durat prea mult.",
  );
  await page
    .getByRole("button", { name: "Încearcă din nou", exact: true })
    .click();
  await expect(page.locator(".heritage-story-text > p")).toHaveText(
    storyFixture(state.property).content.introBody,
  );
  expect(requests).toBe(2);
});

test("a network failure ends loading and preserves the saved listing", async ({
  page,
}) => {
  const state = await workspace(page);
  const original = JSON.stringify(state.property);
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".inline-edit-error")).toContainText(
    "Nu am putut contacta serviciul de redactare.",
  );
  await expect(
    page.getByRole("button", { name: "Editează pe pagină" }),
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
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".estate-story-copy > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(page.locator(".estate-details-copy > p")).toHaveText(
    draft.description,
  );
  await expect(page.locator(".estate-invitation-copy")).toHaveText(
    propertyInvitation(state.property.location),
  );
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
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
  await page.goto(`/previzualizare/${id}`);
  await expect(page.locator(".atelier-intro-address")).toHaveText(
    state.property.location,
  );
  await expect(page.locator(".atelier-story-copy > p")).toHaveText(
    draft.content.introBody,
  );
  await expect(page.locator(".atelier-details-copy > p")).toHaveCount(0);
  await page
    .getByRole("textbox", {
      name: "Editează Textul introducerii",
      exact: true,
    })
    .fill(
      "A personal perspective on this home. Come and discover it for yourself.",
    );
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".atelier-story-copy > p")).toHaveText(
    "A personal perspective on this home. Come and discover it for yourself.",
  );
  await expect(page.locator(".atelier-details-copy > p")).toHaveCount(0);
});
