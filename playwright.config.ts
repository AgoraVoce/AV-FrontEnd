import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/demo",
  fullyParallel: true,
  workers: 3,
  timeout: 30_000,
  expect: { timeout: 5000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5181",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        }
      : undefined,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1504, height: 1024 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5181 --strictPort",
    env: { VITE_AV_LOCAL_API: process.env.PLAYWRIGHT_API_MODE === "1" ? "true" : "false" },
    url: "http://localhost:5181",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
