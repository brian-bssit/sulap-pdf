import { defineConfig } from "@playwright/test";

// Backend sungguhan (FastAPI + Postgres) menyajikan static export di :8765.
// Butuh: E2E_DATABASE_URL (postgresql+asyncpg://…), Python dengan dependency backend (env PYTHON).
// PW_CHANNEL=chrome memakai Chrome terpasang (tanpa unduh browser); kosong → Chromium bawaan Playwright.
export default defineConfig({
  testDir: "./e2e",
  workers: 1, // satu DB bersama
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:8765",
    channel: process.env.PW_CHANNEL || undefined,
    acceptDownloads: true,
  },
  webServer: {
    command: "bash e2e/run-backend.sh",
    url: "http://localhost:8765/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
