import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/room/limits';

describe('TokenBucket', () => {
  it('allows the burst, refuses the next, and refills at the sustained rate', () => {
    let t = 1_000;
    const b = new TokenBucket(20, 40, () => t);
    for (let i = 0; i < 40; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t += 50; // 20/s → one token per 50 ms
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t += 10_000; // refill caps at the burst
    for (let i = 0; i < 40; i++) expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });
});
