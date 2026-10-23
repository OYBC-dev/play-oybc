import { defineInt } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * Global callable options: region, warm-instance count (set MIN_INSTANCES=1 for the party),
 * and a public Cloud Run invoker. Callables authenticate inside each handler via the Firebase
 * ID token; without `invoker: 'public'` a deploy that never set the allUsers binding answers 403.
 */
setGlobalOptions({
  region: 'us-central1',
  minInstances: defineInt('MIN_INSTANCES', { default: 0 }),
  invoker: 'public',
});
