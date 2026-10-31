/** localStorage key set once this device has dismissed the "How tasks work" explainer. */
export const HOW_TO_SEEN_KEY = 'oybc.howto.seen';

/** Whether this device has dismissed the explainer. Storage that throws (private mode, blocked) reads as not seen. */
export function hasSeenHowTo(): boolean {
  try {
    return window.localStorage.getItem(HOW_TO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** Remembers that this device dismissed the explainer. Storage failures are ignored (it shows again next time). */
export function markHowToSeen(): void {
  try {
    window.localStorage.setItem(HOW_TO_SEEN_KEY, '1');
  } catch {
    // Nothing to do: without storage the explainer simply opens again on the next lobby.
  }
}

/**
 * Whether the explainer opens by itself when a lobby renders: never seen on this device, still in the
 * lobby, and this seat has not added any tasks yet (a reconnect with tasks already in the pool skips it).
 *
 * @param input.seen Whether the device has dismissed it before.
 * @param input.stage The game's stage.
 * @param input.authored Tasks this seat has in the pool.
 */
export function shouldAutoOpenHowTo({ seen, stage, authored }: { seen: boolean; stage: string; authored: number }): boolean {
  return !seen && stage === 'lobby' && authored === 0;
}
