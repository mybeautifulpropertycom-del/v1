import { expect, test, type Page } from "@playwright/test";
import { workspace, id } from "./workspace-fixture";
import { propertyStorySource } from "../../src/lib/property-story";
import { storyFixture } from "../story-fixture";
import {
  presentationCopy,
  propertyInvitation,
} from "../../src/lib/presentation-copy";
import { TEMPLATE_LOCATION } from "../../src/lib/template-location";

const designs = [
  ["editorial", "estate", ".estate-story > div:first-child h2"],
  ["minimal", "heritage", ".heritage-story-copy h2"],
  ["panorama", "atelier", ".atelier-story-copy h2"],
] as const;

async function checkPresentation(
  page: Page,
  prefix: string,
  introduction: string,
  address: string,
) {
  if (prefix !== "heritage") {
    await expect(page.locator(introduction)).toContainText(
      "Proprietatea perfectă",
    );
    await expect(page.locator(`${introduction} em`)).toHaveText(
      "pentru tine și familia ta",
    );
  } else {
    await expect(page.locator(introduction)).toBeVisible();
    await expect(
      page.locator(".heritage-story > .heritage-section-heading"),
    ).toHaveCount(0);
  }
  const gallery = page.locator(`#gallery h2`);
  await expect(gallery).toContainText("Descoperă proprietatea.");
  await expect(gallery.locator("em")).toHaveText(
    "Fotografii care reflectă realitatea",
  );
  await expect(page.locator(".mortgage-intro h2")).toHaveText(
    "Estimează bugetul cu ușurință",
  );
  await expect(page.locator(".mortgage-intro p")).toHaveText(
    presentationCopy.mortgage.subtitle,
  );
  if (prefix === "heritage") {
    await expect(
      page.locator(".heritage-gallery > .heritage-section-label"),
    ).toHaveCount(0);
    await expect(
      page.locator(".heritage-details-copy > .heritage-kicker"),
    ).toHaveText("Facilitățile proprietății");
    await expect(page.locator("#heritage-details-title")).toContainText(
      "O locuință potrivită",
    );
    await expect(page.locator("#heritage-details-title em")).toHaveText(
      "pe termen lung",
    );
    await expect(page.locator("#heritage-details-title em")).toHaveCSS(
      "color",
      "rgb(137, 149, 117)",
    );
  }
  if (prefix === "atelier") {
    await expect(page.locator("#details .atelier-kicker")).toHaveText(
      "Caracteristici principale",
    );
    await expect(page.locator("#details h2")).toHaveText(
      "Detalii de care te vei bucura zilnic",
    );
  }
  const contact = page.locator("#contact");
  await expect(contact.locator(".presentation-agent-heading")).toHaveText(
    "Comunică eficient cu vânzătorul",
  );
  if (prefix === "estate") {
    const reference = await page
      .locator(".estate-scene-copy h3")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);
    await expect(contact.locator(".presentation-agent-heading")).toHaveCSS(
      "font-size",
      reference,
    );
    const captions = await page
      .locator(".estate-scene-copy h3")
      .evaluateAll((els) =>
        els.map((el) => ({
          size: getComputedStyle(el).fontSize,
          color: getComputedStyle(el).color,
          accent: getComputedStyle(el.querySelector("em")!).color,
        })),
      );
    expect(captions.length).toBeGreaterThan(0);
    for (const caption of captions)
      expect(caption).toEqual({
        size: reference,
        color: "rgb(255, 255, 255)",
        accent: "rgb(255, 255, 255)",
      });
    if (await page.locator(".estate-film h2").count())
      await expect(page.locator(".estate-film h2")).toHaveCSS(
        "font-size",
        reference,
      );
  }
  const kicker = contact.locator(".presentation-agent-kicker");
  await expect(kicker).toHaveText("Obține răspuns rapid la toate întrebările.");
  expect(
    await kicker.evaluate((el) =>
      Boolean(el.nextElementSibling?.matches(".presentation-agent-heading")),
    ),
  ).toBe(true);
  await expect(contact.locator(".presentation-agent-heading em")).toHaveCount(
    0,
  );
  await expect(contact.locator("form h3")).toHaveText(
    presentationCopy.inquiry.title,
  );
  await expect(contact.locator("form h3 em")).toHaveCount(0);
  await expect(contact.locator("form > p").first()).toHaveText(
    presentationCopy.inquiry.subtitle,
  );
  const invitation = page.locator(`.${prefix}-invitation`);
  await expect(invitation.locator("h2")).toContainText(
    "Te așteptăm să înțelegi",
  );
  await expect(invitation.locator("h2 br")).toHaveCount(1);
  await expect(invitation.locator("h2 em")).toHaveText(
    "cum arată această proprietate",
  );
  await expect(invitation.locator("h2 em")).toHaveCSS(
    "color",
    prefix === "estate"
      ? "rgb(203, 209, 167)"
      : prefix === "heritage"
        ? "rgb(225, 229, 198)"
        : "rgb(123, 115, 94)",
  );
  await expect(page.locator(".mortgage-intro h2")).toHaveCSS(
    "font-size",
    page.viewportSize()!.width === 390 ? "29px" : "44px",
  );
  await expect(page.locator(".mortgage-intro h2")).toHaveCSS(
    "font-weight",
    "500",
  );
  await expect(page.locator(".mortgage-intro h2")).toHaveCSS(
    "font-family",
    /Nunito Sans Variable/,
  );
  await expect(invitation).toContainText(
    "Nu mai pierde timpul cu vizionări inutile",
  );
  await expect(invitation).toContainText(propertyInvitation(address));
  await expect(invitation).toContainText(presentationCopy.invitation.note);
}

for (const [template, prefix, introduction] of designs) {
  test(`${template}: common copy applies to samples, published pages and earlier saved stories`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/modele/${template}`);
    await checkPresentation(page, prefix, introduction, TEMPLATE_LOCATION);
    const invitation = page.locator(`.${prefix}-invitation`);
    const linePositions = await invitation.locator("h2").evaluate((el) => {
      const first = document.createRange();
      first.selectNodeContents(el.firstChild!);
      return {
        first: first.getBoundingClientRect().top,
        accent: el.querySelector("em")!.getBoundingClientRect().top,
      };
    });
    expect(linePositions.accent).toBeGreaterThan(linePositions.first);
    await page.locator("#contact").screenshot({
      path: testInfo.outputPath(`${template}-contact-desktop.png`),
    });
    await invitation.screenshot({
      path: testInfo.outputPath(`${template}-invitation-desktop.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await checkPresentation(page, prefix, introduction, TEMPLATE_LOCATION);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.locator("#contact").screenshot({
      path: testInfo.outputPath(`${template}-contact-mobile.png`),
    });
    await invitation.screenshot({
      path: testInfo.outputPath(`${template}-invitation-mobile.png`),
    });
    await invitation.getByRole("button").first().click();
    await expect(page.locator("#viewing-description")).toHaveText(
      presentationCopy.viewingSubtitle,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Închide/ })
      .click();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/p/map-test-${template}`);
    await checkPresentation(
      page,
      prefix,
      introduction,
      "Strada Test 123, București, România",
    );

    const state = await workspace(page, { template });
    const draft = storyFixture(state.property);
    for (const field of [
      "introTitle",
      "introAccent",
      "storyTitle",
      "storyAccent",
      "galleryTitle",
      "galleryAccent",
      "detailsTitle",
      "detailsAccent",
      "closingTitle",
      "closingAccent",
      "closingBody",
    ] as const)
      draft.content[field] = "Text salvat de versiunea anterioară";
    state.property.website_copy = {
      version: 1,
      source: propertyStorySource(state.property, 1),
      description: draft.description,
      content: draft.content,
    };
    await page.goto(`/previzualizare/${id}`);
    await checkPresentation(
      page,
      prefix,
      introduction,
      state.property.location,
    );
    await expect(
      page.locator(
        prefix === "atelier"
          ? ".atelier-story-copy > p"
          : prefix === "heritage"
            ? ".heritage-story-text > p"
            : ".estate-story-copy > p",
      ),
    ).toHaveText(
      prefix === "atelier" || prefix === "heritage"
        ? draft.description
        : draft.content.introBody,
    );
  });
}
