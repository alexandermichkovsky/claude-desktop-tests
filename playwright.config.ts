import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    screenshot: 'only-on-failure',
  },
  // Tests sequenziell ausführen (Desktop-App hat globalen Zustand)
  workers: 1,
});
