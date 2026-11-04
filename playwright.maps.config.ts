import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated development server with fake browser credentials. Tests stub Google's
// SDK and block Google hosts, so there are no billable Maps/Places requests.
export default defineConfig({
  ...base,
  testDir: "./tests/maps",
  use: { ...base.use, baseURL: "http://127.0.0.1:3004" },
  webServer: {
    command:
      "node --import tsx --import ./tests/fixtures/public-property-server.ts ./node_modules/next/dist/bin/next dev --hostname 0.0.0.0 --port 3004",
    url: "http://127.0.0.1:3004",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://browser-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
      NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: "true",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "fake-maps-test-key",
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "fake-map-id",
    },
  },
});
