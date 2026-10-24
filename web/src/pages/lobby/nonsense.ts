const SYLLABLES = ['ra', 'ke', 'no', 'sti', 'vel', 'um', 'tha', 'pri', 'lo', 'zen', 'qua', 'mi', 'dor', 'fe', 'sa', 'wo', 'bli', 'tur', 'os', 'nye'];

/** Shortest and longest nonsense string a hidden pool row renders. */
export const NONSENSE_MIN = 18;
export const NONSENSE_MAX = 60;

/** 32-bit FNV-1a hash of a string. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Linear congruential generator in [0, 1), seeded. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Stand-in text for a pool row the client may not read. The client never has the
 * real text (or its length), so the length is pseudo-random but stable per task.
 *
 * @param taskId Id of the hidden task; the same id always gives the same string.
 * @returns Lowercase syllable words, NONSENSE_MIN..NONSENSE_MAX characters long.
 */
export function nonsenseFor(taskId: string): string {
  const rng = seeded(hash(taskId));
  const len = NONSENSE_MIN + Math.floor(rng() * (NONSENSE_MAX - NONSENSE_MIN + 1));
  let out = '';
  while (out.length < len) {
    let word = '';
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) word += SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
    out += (out ? ' ' : '') + word;
  }
  return out.slice(0, len).trimEnd().padEnd(len, SYLLABLES[0]!.charAt(0));
}
