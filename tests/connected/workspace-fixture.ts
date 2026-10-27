import { expect, type Page } from "@playwright/test";
import type { Property } from "../../src/lib/model";
import { demoWorkspace } from "../../src/lib/demo";
export type TestLead = {
  id: string;
  property_id: string | null;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
};

export const owner = "11111111-1111-4111-8111-111111111111";
export const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export async function workspace(
  page: Page,
  overrides: Partial<Property> = {},
  initialLeads: TestLead[] = [],
  isAdmin = false,
) {
  const data = demoWorkspace();
  let profile = { ...data.profile, id: owner };
  let property: Property = {
    ...data.properties[1],
    id,
    owner_id: owner,
    status: "draft",
    images: [
      `https://browser-test.supabase.co/storage/v1/object/public/property-images/${owner}/${id}/photo.webp`,
    ],
    ...overrides,
  };
  let deleted = false;
  let leads = [...initialLeads];
  const removedPhotos: string[] = [];
  let uploads = 0;
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
    if (url.pathname.startsWith("/storage/")) {
      if (route.request().method() === "POST") {
        uploads++;
        expect(url.pathname).toContain(`/agent-avatars/${owner}/`);
        return route.fulfill({ json: { Key: url.pathname } });
      }
      if (route.request().method() === "DELETE") {
        removedPhotos.push(...route.request().postDataJSON().prefixes);
        return route.fulfill({ json: [] });
      }
      return route.fulfill({
        path: "public/images/villa.jpg",
        contentType: "image/jpeg",
      });
    }
    if (url.pathname === "/rest/v1/rpc/is_platform_admin")
      return route.fulfill({ json: isAdmin });
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") {
      if (route.request().method() === "PATCH") {
        profile = { ...profile, ...route.request().postDataJSON() };
        return route.fulfill({ json: { id: owner } });
      }
      return route.fulfill({ json: profile });
    }
    if (url.pathname === "/rest/v1/rpc/delete_owned_property") {
      expect(route.request().postDataJSON()).toEqual({ property_id: id });
      const result = !deleted;
      deleted = true;
      leads = leads.map((lead) => ({
        ...lead,
        property_id: lead.property_id === id ? null : lead.property_id,
      }));
      return route.fulfill({ json: result });
    }
    if (url.pathname === "/rest/v1/inquiries") {
      if (route.request().method() === "DELETE") {
        expect(url.searchParams.get("owner_id")).toBe(`eq.${owner}`);
        const leadId = url.searchParams.get("id")?.slice(3);
        leads = leads.filter((lead) => lead.id !== leadId);
        return route.fulfill({ json: { id: leadId } });
      }
      return route.fulfill({ json: leads });
    }
    if (url.pathname === "/rest/v1/properties") {
      if (route.request().method() === "POST") {
        property = route.request().postDataJSON();
        return route.fulfill({ json: property });
      }
      return route.fulfill({
        json: deleted ? [] : url.searchParams.has("id") ? property : [property],
      });
    }
    return route.abort();
  });
  return {
    get property() {
      return property;
    },
    get profile() {
      return profile;
    },
    get leads() {
      return leads;
    },
    get uploads() {
      return uploads;
    },
    removedPhotos,
    token,
  };
}
