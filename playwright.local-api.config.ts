import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-local",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5182", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: "npm run dev -- --port 5182 --strictPort",
    env: { VITE_AV_LOCAL_API: "true" },
    url: "http://localhost:5182",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
