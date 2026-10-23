import { defineInt } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

/** Global callable options: region and warm-instance count (set MIN_INSTANCES=1 for the party). */
setGlobalOptions({ region: 'us-central1', minInstances: defineInt('MIN_INSTANCES', { default: 0 }) });
