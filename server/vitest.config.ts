import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { AUTH_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-play-oybc', ADMIN_TOKEN: 'test-admin' },
      },
    }),
  ],
});
