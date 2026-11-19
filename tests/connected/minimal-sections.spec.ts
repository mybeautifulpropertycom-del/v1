import { expect, test } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";

test("Minimal keeps the story and gallery actions in the right order on desktop and phones", async ({
  page,
}) => {
  await workspace(page, {
    template: "minimal",
    amenities: ["WiFi", "Terasă exterioară"],
    images: [
      "/images/villa.jpg",
      "/images/interior.jpg",
      "/images/kitchen.jpg",
    ],
  });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.goto(`/previzualizare/${id}`);
  await expect(
    page.locator(
      ".heritage-story > .heritage-section-heading, .heritage-story > .heritage-section-label, .heritage-gallery-footer, .heritage-setting, .heritage-contact-note",
    ),
  ).toHaveCount(0);
  const story = page.locator(".heritage-story");
  await expect(
    story.getByText("O perspectivă nouă", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#contact form")).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const order = await story.evaluate((el) => {
      const text = el
        .querySelector(".heritage-story-copy")!
        .getBoundingClientRect();
      const image = el
        .querySelector(".heritage-album-photo")!
        .getBoundingClientRect();
      const action = el
        .querySelector(".heritage-story-action")!
        .getBoundingClientRect();
      return innerWidth > 767
        ? image.right <= text.left && action.left >= image.right
        : text.bottom <= image.top && image.bottom <= action.top;
    });
    expect(order).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([1440, 390].includes(width)) {
      await story.screenshot({
        path: `/tmp/minimal-story-${width}.png`,
        style:
          ".inline-edit-toolbar, .inline-edit-error, .preview-bar { display: none !important; }",
      });
      await page.locator("#contact").screenshot({
        path: `/tmp/minimal-contact-${width}.png`,
        style:
          ".inline-edit-toolbar, .inline-edit-error, .preview-bar { display: none !important; }",
      });
    }
  }
  await page
    .getByRole("button", {
      name: "Deschide galeria foto a proprietății",
      exact: true,
    })
    .click();
  const gallery = page.getByRole("dialog", {
    name: "Galeria foto a proprietății",
  });
  await expect(gallery).toBeVisible();
  await expect(gallery.locator("[data-current-photo]")).toHaveAttribute(
    "alt",
    /fotografia 3$/,
  );
  await page.keyboard.press("ArrowRight");
  await expect(gallery.locator("[data-current-photo]")).toHaveAttribute(
    "alt",
    /fotografia 1$/,
  );
});

test("Minimal contact previews do not send leads", async ({ page }) => {
  await workspace(page, { template: "minimal" });
  await page.route("**/api/property-story", (route) => route.abort());
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  let requests = 0;
  await page.route("**/api/inquiries", (route) => {
    requests++;
    return route.fulfill({ json: { success: true } });
  });
  for (const url of ["/modele/minimal", `/previzualizare/${id}`]) {
    await page.goto(url);
    const form = page.locator(".heritage-inquiry");
    await form.getByLabel("Numele tău", { exact: true }).fill("Alex Popescu");
    await form
      .getByLabel("Adresă de e-mail", { exact: true })
      .fill("alex@example.com");
    await form
      .getByRole("button", { name: "Încearcă formularul de contact" })
      .click();
    await expect(form.getByRole("status")).toHaveText(
      "Aceasta este o previzualizare. Nu a fost trimis niciun mesaj.",
    );
  }
  expect(requests).toBe(0);
});

test("Minimal contact retries failed requests, preserves data and sends a lead only once", async ({
  page,
}) => {
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  const payload = {
    name: "Alex Popescu",
    email: "alex@example.com",
    phone: "+40 712 345 678",
    message: "Aș dori o vizionare în această săptămână.",
    website: "",
    slug: "photos-test-minimal",
  };
  let requests = 0;
  let complete!: () => void;
  await page.route("**/api/inquiries", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual(payload);
    if (requests === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Serviciul este indisponibil temporar." },
      });
    if (requests === 2) return route.abort();
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/p/photos-test-minimal");
  const form = page.locator(".heritage-inquiry");
  await form.getByLabel("Numele tău", { exact: true }).fill(payload.name);
  await form
    .getByLabel("Adresă de e-mail", { exact: true })
    .fill(payload.email);
  await form.getByLabel("Telefon", { exact: false }).fill(payload.phone);
  await form.getByLabel("Mesajul tău", { exact: false }).fill(payload.message);
  const send = form.getByRole("button", {
    name: "Trimite un mesaj",
    exact: true,
  });
  await send.click();
  await expect(form.getByRole("status")).toHaveText(
    "Serviciul este indisponibil temporar.",
  );
  await expect(form.getByLabel("Mesajul tău", { exact: false })).toHaveValue(
    payload.message,
  );
  await send.click();
  await expect(form.getByRole("status")).toHaveText(
    "Nu am putut trimite mesajul. Verifică conexiunea și încearcă din nou.",
  );
  await send.click();
  await expect(
    form.getByRole("button", { name: "Se trimite…" }),
  ).toBeDisabled();
  await form.evaluate((el: HTMLFormElement) => {
    el.requestSubmit();
    el.requestSubmit();
  });
  expect(requests).toBe(3);
  complete();
  await expect(form.getByRole("status")).toContainText(
    "Mesajul a ajuns la agent.",
  );
  await expect(
    form.getByRole("button", { name: "Mesaj primit" }),
  ).toBeDisabled();
  await form.evaluate((el: HTMLFormElement) => el.requestSubmit());
  expect(requests).toBe(3);
});
