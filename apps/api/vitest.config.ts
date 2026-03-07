import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

const envPath = path.resolve(__dirname, '.env.test');
loadEnv({ path: envPath });

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './test/global-setup.ts',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
