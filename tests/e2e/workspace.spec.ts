import { test, expect } from "@playwright/test";
import path from "node:path";

test("dashboard filters, searches, and changes view without fabricated analytics", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.locator(".property-card")).toHaveCount(3);
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await page.getByRole("tab", { name: "Ciorne" }).click();
  await expect(page.locator(".property-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Penthouse cu terasă" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Toate", exact: false }).click();
  await page.getByRole("textbox", { name: "Caută proprietăți" }).fill("Cluj");
  await expect(page.locator(".property-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Șterge căutarea" }).click();
  await page.getByRole("button", { name: "Vizualizare listă" }).click();
  await expect(page.locator(".property-grid")).toHaveClass(/list-layout/);
  await page.getByRole("button", { name: "Filtrare și sortare" }).click();
  await page.getByLabel("Tipul proprietății").selectOption("House");
  await expect(page.locator(".property-card")).toHaveCount(1);
});

test("agent creates, uploads, publishes locally, reloads, edits and unpublishes a listing", async ({
  page,
}) => {
  await page.goto("/dashboard/properties/new");
  await page.getByLabel("Titlul proprietății").fill("A new chapter in Austin");
  await page.getByLabel("Adresă", { exact: false }).fill("Austin, TX");
  await page.getByLabel("Preț", { exact: true }).fill("695000");
  await page.getByLabel("Suprafață", { exact: true }).fill("2100");
  await page
    .getByLabel("Descriere", { exact: false })
    .fill(
      "A beautiful home with generous spaces, a private garden, and abundant natural light throughout.",
    );
  await page.getByRole("button", { name: "Adaugă fotografiile" }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".image-editor-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Alege designul" }).click();
  await page.getByRole("button", { name: /The Atelier/ }).click();
  await page
    .getByRole("button", { name: "Deschide editorul site-ului" })
    .click();
  await expect(page).toHaveURL(/preview\/[a-f0-9-]+$/);
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await page.getByRole("button", { name: "Publică în demo" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Site-ul proprietății a fost publicat.",
  );
  await page.getByRole("button", { name: "Înapoi la editare" }).click();
  await page
    .getByRole("link", { name: "Detaliile proprietății", exact: true })
    .click();
  await expect(page.locator(".published-card")).toContainText(
    "Publicat în demo",
  );
  const editorUrl = page.url();
  await page.reload();
  await expect(page.getByLabel("Titlul proprietății")).toHaveValue(
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
  await page.getByLabel("Titlul proprietății").fill("An even better chapter");
  await page.getByRole("button", { name: "Salvează modificările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările au fost salvate",
  );
  await page
    .getByRole("button", { name: "Retrage site-ul de la publicare" })
    .click();
  await expect(page.locator(".published-card")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Titlul proprietății")).toHaveValue(
    "An even better chapter",
  );
});

test("editing contact details updates all three saved previews", async ({
  page,
}) => {
  await page.goto("/dashboard/profile");
  await page.getByLabel("Nume complet").fill("Taylor Parker");
  await page.getByLabel("E-mail public de contact").fill("taylor@example.com");
  await page.getByRole("button", { name: "Salvează modificările" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Profilul tău a fost salvat",
  );
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
  test.setTimeout(90000); // Loads all 40 photographs across each of three templates.
  for (const template of ["editorial", "minimal", "panorama"]) {
    await page.goto(`/templates/${template}`);
    await expect(page.locator(`.website-${template}`)).toBeVisible();
    await page
      .getByRole("button", { name: "Vezi toate cele 40 fotografii" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".lightbox>span")).toHaveText("2 / 40");
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
  await page.getByLabel("Numele tău").fill("Alex Popescu");
  await page.getByLabel("Adresă de e-mail").fill("alex@example.com");
  await page
    .getByLabel("Mesajul tău")
    .fill("I would love to arrange a showing.");
  await page
    .getByRole("button", { name: "Încearcă formularul de contact" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Aceasta este o previzualizare. Nu a fost trimis niciun mesaj.",
  );
});

test("incomplete properties cannot publish", async ({ page }) => {
  await page.goto("/dashboard/properties/new");
  await page.getByRole("button", { name: "Designul site-ului" }).click();
  await page
    .getByRole("button", { name: "Deschide editorul site-ului" })
    .click();
  await page
    .locator(".inline-edit-toolbar")
    .getByRole("button", { name: "Publică proprietatea" })
    .click();
  await page.getByRole("button", { name: "Publică în demo" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Adaugă cel puțin o fotografie.",
  );
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Titlul trebuie să conțină cel puțin 5 caractere.",
  );
});

test("inline editing saves the property headline and survives reload", async ({
  page,
}) => {
  await page.goto("/preview/demo-villa");
  await page.getByRole("button", { name: "Editează pe pagină" }).click();
  await page
    .getByRole("textbox", { name: "Editează titlul proprietății" })
    .fill("The Garden Residence");
  await page
    .getByRole("textbox", { name: "Editează titlul proprietății" })
    .press("Tab");
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările site-ului au fost salvate.",
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
      name: "Alex Popescu",
      email: "alex@example.com",
      phone: "",
      message: "I would love to arrange a showing.",
      website: "",
    },
  });
  expect(notConnected.status()).toBe(503);
  await page.goto("/login");
  await expect(
    page.getByRole("link", { name: "Explorează versiunea demo" }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("mobile dashboard, editor, and three designs fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.locator(".property-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await page.getByRole("link", { name: "Profilul meu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Câteva cuvinte despre tine." }),
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
