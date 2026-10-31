/**
 * game-core
 *
 * Pure bingo game logic for Play OYBC — detection, shuffle, placement.
 * Primitives in, primitives out: no platform code, no side effects, so the
 * same code runs in the browser and in Node (Cloud Functions).
 */
export * from './bingoDetection';
export * from './shuffle';
export * from './placement';
export * from './constants';
export * from './types';
export * from './names';
export * from './mentions';
export * from './visibility';
export * from './readiness';
export * from './roster';
export * from './deal';
export * from './marks';
export * from './gameCode';
export * from './schema';
