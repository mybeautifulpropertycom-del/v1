import { expect, test } from "@playwright/test";
import { workspace, id, owner } from "./workspace-fixture";
import {
  propertyGroupPost,
  propertyShareLinks,
  propertyShareSource,
} from "../../src/lib/property-sharing";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import sharp from "sharp";

test("published listings show three stacked sharing cards and copy the saved canonical link", async ({
  page,
}, testInfo) => {
  const state = await workspace(page, {
    status: "published",
    address_slug: "saved-public-address",
    title: "Saved listing title",
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  let aiCalls = 0;
  await page.route("**/api/property-share", (route) => {
    aiCalls++;
    expect(route.request().postDataJSON()).toEqual({ propertyId: id });
    return route.fulfill({
      json: {
        text: propertyGroupPost(
          state.property,
          "O locuință pregătită să fie descoperită în fotografii și la o vizionare.",
        ),
        source: propertyShareSource(state.property),
      },
    });
  });
  await page.goto(`/panou/proprietati/${id}`);
  const share = page.getByRole("region", {
    name: "Distribuie proprietatea publicată",
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(share).toBeVisible();
    const cards = share.locator(".property-share-links > *");
    await expect(cards).toHaveCount(3);
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height);
    expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[1].y + boxes[1].height);
    expect(boxes[0].width).toBeCloseTo(boxes[2].width);
    await share.screenshot({ path: testInfo.outputPath(`cards-${width}.png`) });
  }
  await expect(
    share.getByRole("link", { name: "Salvează ca PDF" }),
  ).toHaveAttribute("href", `/p/${state.property.slug}/tiparire`);
  await share.getByRole("button", { name: "Copiază link-ul" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/saved-public-address$/,
  );
  await expect(
    share.getByRole("button", { name: "Link copiat" }),
  ).toBeVisible();
  await page.getByLabel("Titlul proprietății").fill("Unsaved headline");
  await share.getByRole("button", { name: "Publică pe grupuri" }).click();
  const modal = page.getByRole("dialog", {
    name: "Pregătește postarea pentru grupuri",
  });
  await expect(modal.getByLabel("Textul postării")).toHaveValue(
    /Saved listing title/,
  );
  await expect(modal.getByLabel("Textul postării")).toHaveValue(
    /O locuință pregătită/,
  );
  await expect(modal.getByLabel("Textul postării")).not.toHaveValue(
    /Unsaved headline/,
  );
  await expect(
    modal.getByRole("link", { name: /Deschide grupurile Facebook/ }),
  ).toHaveAttribute("href", "https://www.facebook.com/groups/joins/");
  await modal
    .getByRole("button", { name: "Copiază textul", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/saved-public-address$/,
  );
  await modal.screenshot({ path: testInfo.outputPath("group-post-phone.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.screenshot({
    path: testInfo.outputPath("group-post-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(
    share.getByRole("button", { name: "Publică pe grupuri" }),
  ).toBeFocused();
  await share.getByRole("button", { name: "Publică pe grupuri" }).click();
  await expect(modal.getByLabel("Textul postării")).toHaveValue(
    /O locuință pregătită/,
  );
  expect(aiCalls).toBe(1);
  await modal
    .getByRole("button", { name: "Închide pregătirea postării" })
    .click();
  await page
    .getByRole("button", {
      name: "Retrage site-ul de la publicare",
      exact: true,
    })
    .click();
  await expect(share).toHaveCount(0);
  await page.reload();
  await expect(share).toHaveCount(0);
});

test("a new draft has no sharing or PDF controls", async ({ page }) => {
  await workspace(page);
  await page.goto(`/panou/proprietati/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Distribuie proprietatea publicată" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Salvează ca PDF" })).toHaveCount(
    0,
  );
});

test("published print view produces a PDF with photos and hides interactive controls on paper", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printCalled = "true";
    };
  });
  const response = await page.goto("/p/print-test-home/tiparire");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "A home ready to share", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/print-test-address$/,
  );
  await page
    .getByRole("button", { name: "Imprimă / Salvează ca PDF", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-called",
    "true",
  );
  const images = await page
    .locator(".property-print img")
    .evaluateAll((images) =>
      images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
    );
  expect(images).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".property-print-toolbar")).toBeHidden();
  const path = testInfo.outputPath("published-property.pdf");
  const pdf = await page.pdf({
    path,
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.length).toBeGreaterThan(10000);
  await testInfo.attach("property-pdf", {
    path,
    contentType: "application/pdf",
  });
});

test("unpublished or missing print pages are unavailable", async ({ page }) => {
  await page.goto("/p/unpublished-home/tiparire");
  await expect(
    page.getByRole("heading", { name: "Această pagină nu este disponibilă." }),
  ).toBeVisible();
  await expect(page.locator(".property-print")).toHaveCount(0);
});

test("selected photos download as one JPEG archive with the edited post and preserve gallery order", async ({
  page,
}, testInfo) => {
  const images = [1, 2, 3].map(
    (index) =>
      `https://browser-test.supabase.co/storage/v1/object/public/property-images/${owner}/${id}/photo-${index}.webp`,
  );
  const state = await workspace(page, { status: "published", images });
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      path: "public/images/villa.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.route("**/api/property-share", (route) =>
    route.fulfill({
      json: {
        text: propertyGroupPost(
          state.property,
          "O prezentare pentru cei care vor să descopere toate detaliile locuinței.",
        ),
        source: propertyShareSource(state.property),
      },
    }),
  );
  const fetched: string[] = [];
  await page.route(
    "**/storage/v1/object/public/property-images/**",
    async (route) => {
      if (route.request().resourceType() === "fetch") {
        fetched.push(route.request().url());
        expect(route.request().headers().authorization).toBeUndefined();
      }
      const buffer = await sharp({
        create: {
          width: 100,
          height: 70,
          channels: 3,
          background: route.request().url().includes("photo-1")
            ? "#ff0000"
            : "#0000ff",
        },
      })
        .webp()
        .toBuffer();
      return route.fulfill({ body: buffer, contentType: "image/webp" });
    },
  );
  await page.goto(`/panou/proprietati/${id}`);
  await page.getByRole("button", { name: "Publică pe grupuri" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Pregătește postarea pentru grupuri",
  });
  await expect(dialog.getByLabel("Textul postării")).toHaveValue(
    /O prezentare pentru/,
  );
  const caption = `Text adaptat de agent pentru grup.\n${propertyShareLinks(state.property)!.url}`;
  await dialog.getByLabel("Textul postării").fill(caption);
  await dialog
    .getByRole("button", { name: "Fotografia 2", exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog
      .getByRole("button", { name: "Descarcă fotografiile", exact: true })
      .click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-facebook\.zip$/);
  const file = testInfo.outputPath("postare.zip");
  await download.saveAs(file);
  const archive = unzipSync(await readFile(file));
  expect(Object.keys(archive)).toEqual([
    "text-postare.txt",
    "fotografie-01.jpg",
    "fotografie-02.jpg",
  ]);
  expect(strFromU8(archive["text-postare.txt"])).toBe(caption);
  for (const name of ["fotografie-01.jpg", "fotografie-02.jpg"]) {
    const meta = await sharp(archive[name]).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(70);
  }
  expect(fetched).toEqual([images[0], images[2]]);
  await expect(
    dialog.getByRole("button", { name: "Fotografii descărcate" }),
  ).toBeVisible();
});

test("manual edits survive a late AI reply; a failed AI request leaves facts and photos usable", async ({
  page,
}) => {
  const state = await workspace(page, { status: "published" });
  let release: (() => void) | undefined;
  let calls = 0;
  await page.route("**/api/property-share", async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({
        json: {
          text: propertyGroupPost(
            state.property,
            "O introducere redactată ulterior pentru această proprietate.",
          ),
          source: propertyShareSource(state.property),
        },
      });
    }
    return route.fulfill({
      status: 503,
      json: {
        error:
          "Textul cu AI nu este disponibil momentan. Poți folosi sau edita textul afișat.",
      },
    });
  });
  await page.goto(`/panou/proprietati/${id}`);
  await page.getByRole("button", { name: "Publică pe grupuri" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Pregătește postarea pentru grupuri",
  });
  await expect.poll(() => Boolean(release)).toBe(true);
  await dialog
    .getByLabel("Textul postării")
    .fill("Textul ales de agent, păstrat după răspunsul AI.");
  release!();
  await expect(dialog.getByRole("status")).not.toContainText("Pregătim textul");
  await expect(dialog.getByLabel("Textul postării")).toHaveValue(
    "Textul ales de agent, păstrat după răspunsul AI.",
  );
  await dialog
    .getByRole("button", { name: "Închide pregătirea postării" })
    .click();
  await page.evaluate(() => sessionStorage.clear());
  await page.getByRole("button", { name: "Publică pe grupuri" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Poți folosi sau edita textul afișat",
  );
  await expect(dialog.getByLabel("Textul postării")).toHaveValue(
    new RegExp(state.property.title),
  );
  await expect(
    dialog.getByRole("button", { name: "Descarcă fotografiile" }),
  ).toBeEnabled();
});
