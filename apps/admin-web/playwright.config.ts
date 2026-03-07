import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../../.env.test.example') });
loadEnv({ path: resolve(__dirname, '../../.env.test.local'), override: true });

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  use: {
    headless: true,
  },
});
