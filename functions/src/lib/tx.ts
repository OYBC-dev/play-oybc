/** Game-wide transactions conflict under concurrency (every write touches the game doc); allow many retries. */
export const TX_OPTIONS = { maxAttempts: 25 };
