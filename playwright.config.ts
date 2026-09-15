import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        }
      : {},
  },
  reporter: "list",
});
