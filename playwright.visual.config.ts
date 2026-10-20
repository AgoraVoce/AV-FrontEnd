import { defineConfig, devices } from "@playwright/test";

const apiMode = process.env.VISUAL_API_MODE === "true";

export default defineConfig({
  testDir: "./visual",
  testMatch: apiMode ? "**/api.visual.spec.ts" : "**/demo.visual.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    reducedMotion: "reduce",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    env: { VITE_AV_LOCAL_API: apiMode ? "true" : "false" },
    url: "http://127.0.0.1:5173/login",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
