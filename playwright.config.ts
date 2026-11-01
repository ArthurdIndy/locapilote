/**
 * Tests de parcours (Playwright) : l'application est construite puis servie en local, et
 * chaque scénario est rejoué sur ordinateur et sur téléphone.
 *
 * Pour viser un aperçu Cloudflare plutôt que le site local :
 *   BASE_URL=https://<branche>-locapilote.<compte>.workers.dev npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:4173';
const local = !process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ordinateur',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'telephone',
      // Pixel 7 (Chromium) : 412 px de large ; on descend à 375 px, la largeur d'un iPhone SE.
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: local
    ? {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
