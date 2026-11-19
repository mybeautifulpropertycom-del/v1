import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: [
        "--no-sandbox",
        // Chat tests intercept the script; other suites must not create live
        // Jivo visitors when they open the dashboard.
        "--host-resolver-rules=MAP code.jivosite.com ~NOTFOUND",
      ],
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
