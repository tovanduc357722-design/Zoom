import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    launchOptions: {
      executablePath: await chromium.executablePath(),
      args: chromium.args.filter((arg) => arg !== "--single-process"),
    },
  },
});
