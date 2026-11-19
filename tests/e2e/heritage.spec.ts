import { test, expect } from "@playwright/test";
import { demoWorkspace } from "../../src/lib/demo";
import {
  propertyStory,
  propertyStorySource,
} from "../../src/lib/property-story";

test("Heritage hero keeps its summary directly below the photograph during normal scrolling", async ({
  page,
}) => {
  await page.goto("/modele/minimal");
  const stage = page.locator(".heritage-hero-stage");
  const hero = page.locator(".heritage-hero");
  const summary = page.locator(".heritage-hero-summary");
  await expect(stage).not.toHaveAttribute("data-zoom-pinned");
  const photoBounds = await hero.boundingBox();
  const summaryBounds = await summary.boundingBox();
  const bounds = await stage.boundingBox();
  expect(summaryBounds!.y).toBeCloseTo(photoBounds!.y + photoBounds!.height, 0);
  expect(bounds!.height).toBeCloseTo(
    photoBounds!.height + summaryBounds!.height,
    0,
  );
  await page.evaluate(() => window.scrollBy(0, 200));
  expect((await hero.boundingBox())!.y).toBeCloseTo(photoBounds!.y - 200, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero).toHaveCSS("position", "relative");
});

test("Heritage highlights loop as text, pause on hover, and remain fully readable with reduced motion", async ({
  page,
}) => {
  await page.goto("/modele/minimal");
  const strip = page.getByLabel("Punctele forte ale proprietății");
  await expect(strip.locator("svg")).toHaveCount(0);
  await expect(strip.locator("ul").first().locator("li")).toHaveText(
    demoWorkspace().properties[0].amenities,
  );
  await expect(strip.locator("ul").last()).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-iteration-count",
    "infinite",
  );
  await expect(strip.getByRole("button")).toHaveCount(0);
  await strip.hover();
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-play-state",
    "paused",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(strip.locator(".heritage-amenity-track")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(strip.locator("ul").last()).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("O LOCUINȚĂ. O EMOȚIE. UN NOU ÎNCEPUT.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".heritage-setting")).toHaveCount(0);
  expect(
    await strip.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

test("reviewed property copy persists, gallery captions stay hidden, and changed facts invalidate old analysis", async ({
  page,
}) => {
  await page.goto("/panou");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const workspace = demoWorkspace();
  const listing = workspace.properties[1];
  listing.website_copy = {
    version: 1,
    source: propertyStorySource(listing),
    content: {
      ...propertyStory(listing),
      introTitle: "Windows onto a new day.",
      captions: listing.images.map((_, i) => `Reviewed caption ${i + 1}`),
    },
  };
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("my-beautiful-property-demo", 1);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(data, "state");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, workspace);
  await page.goto("/previzualizare/demo-apartment");
  await expect(page.locator(".heritage-story-copy h2")).toContainText(
    propertyStory(listing).storyTitle,
  );
  await expect(page.locator(".heritage-photo-grid figcaption")).toHaveCount(0);
  await expect(
    page.getByLabel("Punctele forte ale proprietății").locator("ul").first(),
  ).not.toContainText("Grădină privată");
  await page.getByRole("button", { name: "Editează pe pagină" }).click();
  await page
    .getByRole("textbox", {
      name: "Editează Descrierea secțiunii principale",
      exact: true,
    })
    .fill("Your Austin story.");
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(
    page.getByText("Modificările site-ului au fost salvate.", { exact: true }),
  ).toBeVisible();
  await page.goto("/previzualizare/demo-apartment");
  await expect(page.locator(".heritage-story-text > p")).toContainText(
    "Your Austin story.",
  );
  await page.goto("/panou/proprietati/demo-apartment");
  await page.getByLabel(/^Adresă/).fill("Portland, OR");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(
    page.getByText("Modificările au fost salvate.", { exact: true }),
  ).toBeVisible();
  await page.goto("/previzualizare/demo-apartment");
  await expect(page.locator(".heritage-property-details")).toContainText(
    "Portland, OR",
  );
  await expect(page.locator(".heritage-story-text > p")).not.toContainText(
    "Your Austin story.",
  );
});

test("every Schedule a tour CTA opens the calendar and sample requests never send", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-24T16:00:00Z") });
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/inquiries") && request.method() === "POST")
      submissions++;
  });
  await page.goto("/modele/minimal");
  const triggers = page.getByRole("button", {
    name: "Programează o vizionare",
    exact: true,
  });
  expect(await triggers.count()).toBeGreaterThan(3);
  for (const trigger of await triggers.all()) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: /Să ne întâlnim/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Nume complet")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await triggers.first().click();
  const dialog = page.getByRole("dialog", { name: /Să ne întâlnim/ });
  await dialog.getByLabel("Nume complet").fill("Alex Popescu");
  await dialog.getByLabel("Număr de telefon").fill("+1 (202) 555-0100");
  await dialog.getByLabel("Adresă de e-mail").fill("alex@example.com");
  await dialog
    .getByRole("button", { name: "duminică, 25 octombrie 2026", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Solicită o vizionare privată" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Aceasta este o previzualizare. Nu a fost trimisă nicio cerere de vizionare.",
  );
  expect(submissions).toBe(0);
});

test("Heritage gallery filters real photographs and opens the right image", async ({
  page,
}) => {
  await page.goto("/modele/minimal");
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(40);
  await page
    .getByRole("button", { name: "Prime impresii", exact: true })
    .click();
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(3);
  await page
    .getByRole("button", {
      name: "Mărește fotografia proprietății 3",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Galeria foto a proprietății",
  });
  await expect(dialog.locator("[data-current-photo]")).toHaveAttribute(
    "alt",
    /fotografia 3$/,
  );
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator("[data-current-photo]")).toHaveAttribute(
    "alt",
    /fotografia 4$/,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Toate fotografiile", exact: true })
    .click();
  await expect(page.locator(".heritage-photo-grid figure")).toHaveCount(40);
  const ids = await page
    .locator("main > section[id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(ids.indexOf("contact")).toBe(ids.indexOf("film") + 1);
});

test("Heritage uses saved listing data, supports inline edits, and fits phones", async ({
  page,
}) => {
  await page.goto("/previzualizare/demo-apartment");
  await expect(page.locator(".heritage-hero h1")).toHaveText(
    "Apartamentul luminos",
  );
  await expect(page.locator(".heritage-facts")).toContainText("875.000");
  await expect(page.locator(".heritage-facts")).toContainText("135");
  await expect(page.locator(".heritage-agent")).toContainText("Olivia Popescu");
  await page.getByRole("button", { name: "Editează pe pagină" }).click();
  const headline = page.getByRole("textbox", {
    name: "Editează titlul proprietății",
  });
  await headline.fill("The Lantern House");
  await headline.press("Tab");
  await page.getByRole("button", { name: "Salvează site-ul" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Modificările site-ului au fost salvate.",
  );
  await page.reload();
  await expect(page.locator(".heritage-hero h1")).toHaveText(
    "The Lantern House",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/modele/minimal");
  await expect(page.locator(".heritage-hero-stage")).not.toHaveAttribute(
    "data-zoom-pinned",
  );
  await page.locator(".heritage-hero-stage").evaluate((node) =>
    window.scrollTo({
      top: node.getBoundingClientRect().top + scrollY + 150,
      behavior: "instant",
    }),
  );
  for (const section of await page.locator("main > section").all()) {
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Programează o vizionare", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Solicită o vizionare privată" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Solicită o vizionare privată" }),
  ).toBeVisible();
});
