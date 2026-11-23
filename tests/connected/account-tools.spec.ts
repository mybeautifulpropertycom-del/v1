import { test, expect } from "@playwright/test";
import { workspace, id, owner } from "./workspace-fixture";
import path from "node:path";
const lead = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  property_id: id,
  name: "Alex Buyer",
  email: "buyer@example.com",
  phone: "+1 202 555 0150",
  message: "I would like to arrange a private tour.",
  created_at: new Date().toISOString(),
};

test("profile uploads use owned storage and the saved portrait survives a reload", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/panou/profil");
  await expect(page.getByText("Alege Imaginea", { exact: true })).toBeVisible();
  await expect(page.locator(".localized-file-name")).toHaveText(
    "Niciun fișier selectat",
  );
  await page
    .getByLabel("Fotografie de profil", { exact: true })
    .setInputFiles(path.join(process.cwd(), "public/images/villa.jpg"));
  await expect(page.locator(".profile-preview-avatar img")).toBeVisible();
  await expect(page.locator(".localized-file-name")).toHaveText("villa.jpg");
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvat");
  expect(state.uploads).toBe(1);
  expect(state.profile.avatar_url).toContain(`/agent-avatars/${owner}/`);
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toHaveAttribute(
    "src",
    state.profile.avatar_url!,
  );
  await page.getByRole("button", { name: "Elimină fotografia" }).click();
  await page
    .getByRole("button", { name: "Salvează modificările", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("salvat");
  await page.reload();
  await expect(page.locator(".profile-preview-avatar img")).toHaveCount(0);
});

test("profile introductions can be generated three times and edited, with an empty agency", async ({
  page,
}) => {
  const state = await workspace(page);
  const original = state.profile.bio;
  state.profile.agency = "";
  let remaining = 3;
  const roles: string[] = [];
  await page.route("**/api/profile-bio", async (route) => {
    expect(route.request().headers().authorization).toBe(
      `Bearer ${state.token}`,
    );
    if (route.request().method() === "GET")
      return route.fulfill({ json: { remaining } });
    const { role, agency } = route.request().postDataJSON();
    expect(agency).toBe("");
    roles.push(role);
    const bio =
      role === "owner"
        ? "Îți prezint proprietatea mea și răspund la întrebări."
        : "Prezint proprietățile prin informații clare și organizez vizionări.";
    return route.fulfill({ json: { bio, remaining: --remaining } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/panou/profil");
  const bio = page.getByRole("textbox", {
    name: "O scurtă prezentare",
    exact: true,
  });
  const role = page.getByRole("combobox", {
    name: "Tipul de profil",
    exact: true,
  });
  const changeRole = page.getByRole("button", {
    name: "Schimbă tipul de profil",
  });
  const save = page.getByRole("button", {
    name: "Salvează modificările",
    exact: true,
  });
  const generate = page.getByRole("button", { name: "Generează descrierea" });
  const agency = page.getByLabel("Agenție imobiliară", { exact: true });
  await expect(bio).toHaveAttribute("maxlength", "300");
  await expect(role).toHaveValue("");
  await expect(generate).toBeDisabled();
  await expect(agency).toHaveCount(0);
  await role.selectOption("agent");
  await expect(role).toHaveCount(0);
  await expect(agency).toBeFocused();
  await expect(agency).not.toHaveAttribute("required", "");
  await agency.fill("Agenția Test");
  await changeRole.click();
  await role.selectOption("owner");
  await expect(agency).toHaveCount(0);
  await expect(role).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Tipul prezentării" }),
  ).toHaveCount(0);
  await generate.click();
  await expect(bio).toHaveValue(
    "Îți prezint proprietatea mea și răspund la întrebări.",
  );
  expect(state.profile.bio).toBe(original);
  await save.click();
  await expect(page.getByRole("status")).toContainText("salvat");
  expect(state.profile.profile_role).toBe("owner");
  expect(state.profile.agency).toBe("");
  await page.reload();
  await expect(agency).toHaveCount(0);
  await expect(role).toHaveCount(0);
  await changeRole.click();
  await role.selectOption("agent");
  await generate.click();
  await expect(bio).toHaveValue(
    "Prezint proprietățile prin informații clare și organizez vizionări.",
  );
  await expect(
    page.getByText(
      /Mai ai .* generăr|Mai ai o generare|Până la trei generări AI/,
    ),
  ).toHaveCount(0);
  await expect(generate).toHaveCSS("min-height", "30px");
  await generate.click();
  await expect(generate).toBeDisabled();
  expect(roles).toEqual(["owner", "agent", "agent"]);
  await bio.fill("Îți răspund la întrebări și stabilim împreună o vizionare.");
  await save.click();
  await expect(page.getByRole("status")).toContainText("salvat");
  await page.reload();
  await expect(generate).toBeDisabled();
  await expect(bio).toHaveValue(
    "Îți răspund la întrebări și stabilim împreună o vizionare.",
  );
  await expect(agency).toHaveValue("");
  expect(state.profile.profile_role).toBe("agent");
});

test("deleting a property removes its page entry and saved photos but keeps its lead", async ({
  page,
}) => {
  const state = await workspace(page, {}, [lead]);
  await page.goto("/panou");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: `Șterge ${state.property.title}`,
      exact: true,
    })
    .click();
  await expect(page.locator(".property-card")).toHaveCount(0);
  await expect.poll(() => state.removedPhotos.length).toBe(1);
  expect(state.removedPhotos[0]).toBe(`${owner}/${id}/photo.webp`);
  await page.goto("/panou/mesaje");
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  await expect(
    page.getByText("Proprietate ștearsă", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Vezi proprietatea" }),
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: `Șterge mesajul de la ${lead.name}` })
    .click();
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Șterge mesajul de la ${lead.name}` })
    .click();
  await expect(page.locator(".inquiry-card")).toHaveCount(0);
  expect(state.leads).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".inquiry-card")).toHaveCount(0);
});

test("a failed deletion keeps the lead visible and offers another attempt", async ({
  page,
}) => {
  await workspace(page, {}, [lead]);
  await page.route("**/rest/v1/inquiries?**", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: { message: "Test failure" } })
      : route.fallback(),
  );
  await page.goto("/panou/mesaje");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Șterge mesajul de la ${lead.name}` })
    .click();
  await expect(page.locator(".delete-error")).toContainText(
    "nu a putut fi șters",
  );
  await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Șterge mesajul de la ${lead.name}` }),
  ).toBeEnabled();
});
