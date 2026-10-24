import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Run after a build with the fake public Supabase URL specified in CI. External
// Auth, Storage, database, and AI HTTP responses are intercepted by these tests.
export default defineConfig({
  ...base,
  testDir: "./tests/connected",
  use: { ...base.use, baseURL: "http://127.0.0.1:3002" },
  webServer: {
    command: "npm run start -- --port 3002",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
