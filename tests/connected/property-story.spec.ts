import { test, expect, type Page } from "@playwright/test";
import { demoWorkspace } from "../../src/lib/demo";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function workspace(page: Page) {
  const data = demoWorkspace();
  const profile = { ...data.profile, id: owner };
  let property = {
    ...data.properties[1],
    id,
    owner_id: owner,
    images: [
      `https://browser-test.supabase.co/storage/v1/object/public/property-images/${owner}/${id}/photo.webp`,
    ],
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: "authenticated", aud: "authenticated" })).toString("base64url")}.test-signature`;
  const user = {
    id: owner,
    email: profile.email,
    aud: "authenticated",
    role: "authenticated",
  };
  await page.addInitScript(
    ({ token, user, expires }) => {
      localStorage.setItem(
        "sb-browser-test-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_at: expires,
          expires_in: 3600,
          user,
        }),
      );
    },
    { token, user, expires },
  );
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/storage/"))
      return route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      });
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles")
      return route.fulfill({ json: profile });
    if (url.pathname === "/rest/v1/properties") {
      if (route.request().method() === "POST") {
        property = route.request().postDataJSON();
        return route.fulfill({ json: { id: property.id } });
      }
      return route.fulfill({ json: [property] });
    }
    return route.abort();
  });
  return {
    get property() {
      return property;
    },
    token,
  };
}

test("authenticated generation shows copy, applies it, saves it, and updates the real preview route", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.route("**/api/property-story", async (route) => {
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    expect(route.request().postDataJSON()).toEqual({ propertyId: id });
    await route.fulfill({
      json: {
        draft: storyFixture(state.property),
        source: propertyStorySource(state.property),
      },
    });
  });
  await page.goto(`/dashboard/properties/${id}`);
  const composer = page.getByRole("region", { name: "A story of its own." });
  await composer
    .getByRole("button", { name: "Create my property story" })
    .click();
  await expect(
    composer.getByRole("heading", { name: "Your property, in a few words." }),
  ).toBeVisible();
  await expect(composer.locator(".story-feedback")).toBeFocused();
  await expect(
    composer.getByRole("textbox", {
      name: "Property description",
      exact: true,
    }),
  ).toHaveValue(storyFixture(state.property).description);
  await expect(
    composer.getByRole("button", { name: "Create my property story" }),
  ).toBeEnabled();
  await composer.getByRole("button", { name: "Use this story" }).click();
  await composer
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    composer.getByRole("link", { name: "Preview updated website" }),
  ).toBeVisible();
  expect(state.property.website_copy?.content.galleryBody).toBe(
    storyFixture(state.property).content.galleryBody,
  );
  await page.goto(`/preview/${id}`);
  await expect(page.locator(".heritage-story-copy > p")).toHaveText(
    storyFixture(state.property).description,
  );
  await expect(
    page.locator(".heritage-gallery .heritage-section-heading > p"),
  ).toHaveText(storyFixture(state.property).content.galleryBody);
  await expect(page.locator(".heritage-invitation-copy")).toHaveText(
    storyFixture(state.property).content.closingBody,
  );
});

test("billing errors are visible, include a safe reference, stop loading, and allow retry", async ({
  page,
}) => {
  await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "AI writing has no available API credit.",
        code: "AI_CREDITS",
        reference: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    }),
  );
  await page.goto(`/dashboard/properties/${id}`);
  const composer = page.getByRole("region", { name: "A story of its own." });
  await composer
    .getByRole("button", { name: "Create my property story" })
    .click();
  await expect(composer.getByRole("alert")).toContainText(
    "AI writing has no available API credit.",
  );
  await expect(composer.getByRole("alert")).toContainText("AI_CREDITS");
  await expect(composer.locator(".story-feedback")).toBeFocused();
  await expect(
    composer.getByRole("button", { name: "Create my property story" }),
  ).toBeEnabled();
  await expect(composer.locator(".story-review")).toHaveCount(0);
});

test("a platform timeout page ends loading with an actionable message instead of a JSON parsing error", async ({
  page,
}) => {
  await workspace(page);
  await page.route("**/api/property-story", (route) =>
    route.fulfill({
      status: 504,
      contentType: "text/html",
      body: "<h1>Function timed out</h1>",
    }),
  );
  await page.goto(`/dashboard/properties/${id}`);
  const composer = page.getByRole("region", { name: "A story of its own." });
  await composer
    .getByRole("button", { name: "Create my property story" })
    .click();
  await expect(composer.getByRole("alert")).toHaveText(
    "The writing service took too long to respond. Please try again shortly.",
  );
  await expect(
    composer.getByRole("button", { name: "Create my property story" }),
  ).toBeEnabled();
  await expect(composer.getByRole("alert")).not.toContainText(
    "Unexpected token",
  );
});

test("a network failure stops loading and leaves the saved property unchanged", async ({
  page,
}) => {
  const state = await workspace(page);
  const original = JSON.stringify(state.property);
  await page.route("**/api/property-story", (route) => route.abort());
  await page.goto(`/dashboard/properties/${id}`);
  const composer = page.getByRole("region", { name: "A story of its own." });
  await composer
    .getByRole("button", { name: "Create my property story" })
    .click();
  await expect(composer.getByRole("alert")).toHaveText(
    "We could not reach the writing service. Check your connection and try again.",
  );
  await expect(
    composer.getByRole("button", { name: "Create my property story" }),
  ).toBeEnabled();
  expect(JSON.stringify(state.property)).toBe(original);
});
