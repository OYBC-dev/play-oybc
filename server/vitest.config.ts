import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { AUTH_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-play-oybc', ADMIN_TOKEN: 'test-admin' },
        },
      },
    },
  },
});
