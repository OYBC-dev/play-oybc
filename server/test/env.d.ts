import type { Env as ServerEnv } from '../src/index';

declare global {
  namespace Cloudflare {
    // The test-visible bindings are exactly the production Env.
    interface Env extends ServerEnv {}
  }
}
