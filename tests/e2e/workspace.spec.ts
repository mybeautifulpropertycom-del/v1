import { test, expect } from "@playwright/test";
import path from "node:path";

test("dashboard filters, searches, and changes view without fabricated analytics", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.locator(".property-card")).toHaveCount(3);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("tab", { name: "Drafts" }).click();
  await expect(page.locator(".property-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Above the Ordinary" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "All", exact: false }).click();
  await page.getByRole("textbox", { name: "Search properties" }).fill("Austin");
  await expect(page.locator(".property-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".property-grid")).toHaveClass(/list-layout/);
  await page.getByRole("button", { name: "Filter and sort" }).click();
  await page.getByLabel("Property type").selectOption("House");
  await expect(page.locator(".property-card")).toHaveCount(1);
});

test("agent creates, uploads, publishes locally, reloads, edits and unpublishes a listing", async ({
  page,
}) => {
  await page.goto("/dashboard/properties/new");
  await page.getByLabel("Property headline").fill("A new chapter in Austin");
  await page.getByLabel("Address", { exact: false }).fill("Austin, TX");
  await page.getByLabel("Price", { exact: true }).fill("695000");
  await page.getByLabel("Property size").fill("2100");
  await page
    .getByLabel("Description", { exact: false })
    .fill(
      "A beautiful home with generous spaces, a private garden, and abundant natural light throughout.",
    );
  await page.getByRole("button", { name: "Add your photos" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".image-editor-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Choose your design" }).click();
  await page.getByRole("button", { name: /The Atelier/ }).click();
  await page.getByRole("button", { name: "Open website editor" }).click();
  await expect(page).toHaveURL(/preview\/[a-f0-9-]+$/);
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await page.getByRole("button", { name: "Publish in demo" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your property website is published.",
  );
  await page.getByRole("button", { name: "Back to editing" }).click();
  await page
    .getByRole("link", { name: "Property details", exact: true })
    .click();
  await expect(page.locator(".published-card")).toContainText(
    "Published in demo",
  );
  const editorUrl = page.url();
  await page.reload();
  await expect(page.getByLabel("Property headline")).toHaveValue(
    "A new chapter in Austin",
  );
  const propertyId = editorUrl.split("/").pop();
  await page.goto(`/preview/${propertyId}`);
  await expect(page.locator(".website-panorama")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A new chapter in Austin", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".atelier-cover img")).toHaveJSProperty(
    "naturalWidth",
    540,
  );
  await page.goto(editorUrl);
  await page.getByLabel("Property headline").fill("An even better chapter");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your changes are saved",
  );
  await page.getByRole("button", { name: "Unpublish website" }).click();
  await expect(page.locator(".published-card")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Property headline")).toHaveValue(
    "An even better chapter",
  );
});

test("editing contact details updates all three saved previews", async ({
  page,
}) => {
  await page.goto("/dashboard/profile");
  await page.getByLabel("Full name").fill("Taylor Parker");
  await page.getByLabel("Public contact email").fill("taylor@example.com");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Your profile is saved");
  for (const id of ["demo-villa", "demo-apartment", "demo-penthouse"]) {
    await page.goto(`/preview/${id}`);
    await expect(page.locator(".landing-agent-profile")).toContainText(
      "Taylor Parker",
    );
    await expect(
      page.locator('.landing-agent a[href="mailto:taylor@example.com"]'),
    ).toBeVisible();
  }
});

test("each template has working gallery controls and honest preview contact behavior", async ({
  page,
}) => {
  for (const template of ["editorial", "minimal", "panorama"]) {
    await page.goto(`/templates/${template}`);
    await expect(page.locator(`.website-${template}`)).toBeVisible();
    await page.getByRole("button", { name: "View all 4 photos" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".lightbox>span")).toHaveText("2 / 4");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Offscreen photographs load lazily. Check them after bringing each
    // gallery image into view, rather than requiring every image at page load.
    for (const photo of await page.locator("#gallery img").all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
  }
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill("alex@example.com");
  await page
    .getByLabel("Your message")
    .fill("I would love to arrange a showing.");
  await page.getByRole("button", { name: "Try the contact form" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "This is a preview. No message has been sent.",
  );
});

test("incomplete properties cannot publish", async ({ page }) => {
  await page.goto("/dashboard/properties/new");
  await page.getByRole("button", { name: "Website design" }).click();
  await page.getByRole("button", { name: "Open website editor" }).click();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publish Property" })
    .click();
  await page.getByRole("button", { name: "Publish in demo" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Add at least one photo.",
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "The headline needs at least 5 characters.",
  );
});

test("inline editing saves the property headline and survives reload", async ({
  page,
}) => {
  await page.goto("/preview/demo-villa");
  await page.getByRole("button", { name: "Edit on page" }).click();
  await page
    .getByRole("textbox", { name: "Edit property headline" })
    .fill("The Garden Residence");
  await page
    .getByRole("textbox", { name: "Edit property headline" })
    .press("Tab");
  await page.getByRole("button", { name: "Save website" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your website changes are saved.",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The Garden Residence", level: 1 }),
  ).toBeVisible();
});

test("public routes do not leak local demo data and contact API validates requests", async ({
  request,
  page,
}) => {
  const publicPage = await request.get("/p/the-palm-residence-demo");
  expect(publicPage.status()).toBe(404);
  const invalid = await request.post("/api/inquiries", {
    data: { email: "invalid" },
  });
  expect(invalid.status()).toBe(400);
  const notConnected = await request.post("/api/inquiries", {
    data: {
      slug: "some-home",
      name: "Alex Morgan",
      email: "alex@example.com",
      phone: "",
      message: "I would love to arrange a showing.",
      website: "",
    },
  });
  expect(notConnected.status()).toBe(503);
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "Explore the demo" }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("mobile dashboard, editor, and three designs fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.locator(".property-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
  for (const route of [
    "/dashboard",
    "/dashboard/properties/demo-villa",
    "/dashboard/templates",
    "/templates/editorial",
    "/templates/minimal",
    "/templates/panorama",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      route,
    ).toBe(true);
  }
});
