/** Sustained actions per second one socket may send. */
export const ACTS_PER_SECOND = 20;
/** Actions one socket may send at once before the sustained rate applies. */
export const ACT_BURST = 40;
/** Most sockets one game accepts at a time. */
export const MAX_SOCKETS = 100;
/** Most attached sockets one uid keeps in a game; a further `hello` closes that uid's oldest (`superseded`). */
export const MAX_SOCKETS_PER_UID = 4;

/**
 * A token bucket: holds up to `burst` tokens, refills at `perSecond`, and each `take` spends one.
 * Kept in memory per socket; a hibernation wake starts a fresh (full) bucket, which only ever errs generous.
 */
export class TokenBucket {
  private tokens: number;
  private at: number;

  /**
   * @param perSecond Refill rate in tokens per second.
   * @param burst Capacity (and the starting balance).
   * @param now Clock in epoch ms (default `Date.now`).
   */
  constructor(
    private readonly perSecond = ACTS_PER_SECOND,
    private readonly burst = ACT_BURST,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.at = now();
  }

  /** Spends one token; returns false (spending nothing) when the bucket is empty. */
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.at) / 1000) * this.perSecond);
    this.at = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
