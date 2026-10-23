import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GAME_CODE_ALPHABET, GAME_CODE_LENGTH } from 'game-core';
import { appError } from './errors';

if (getApps().length === 0) initializeApp();

/** Shared Admin Firestore instance. */
export const db = getFirestore();

/** Document/collection references for every path of a game. */
export function refs(gameId: string) {
  const game = db.doc(`games/${gameId}`);
  return {
    game,
    members: game.collection('members'),
    member: (uid: string) => game.collection('members').doc(uid),
    seats: game.collection('seats'),
    seat: (seatId: string) => game.collection('seats').doc(seatId),
    tasks: game.collection('tasks'),
    task: (taskId: string) => game.collection('tasks').doc(taskId),
    views: game.collection('views'),
    view: (seatId: string) => game.collection('views').doc(seatId),
    boards: game.collection('boards'),
    board: (seatId: string) => game.collection('boards').doc(seatId),
    bingos: game.collection('bingos'),
    bingo: (id: string) => game.collection('bingos').doc(id),
    reclaims: game.collection('reclaims'),
    reclaim: (id: string) => game.collection('reclaims').doc(id),
  };
}

/** codes/{code} reference (code must already be uppercased). */
export function codeRef(code: string) {
  return db.doc(`codes/${code}`);
}

const CODE_RE = new RegExp(`^[${GAME_CODE_ALPHABET}]{${GAME_CODE_LENGTH}}$`);

/**
 * Normalizes a raw join code (trim, uppercase) and validates its shape.
 * @throws game-not-found (not-found) when malformed, before any doc ref is built.
 */
export function parseCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) throw appError('not-found', 'game-not-found');
  return code;
}

/**
 * Validates a client-supplied game id before a doc ref is built.
 * @throws game-not-found (not-found) when empty, non-string or containing '/'.
 */
export function parseGameId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.includes('/')) throw appError('not-found', 'game-not-found');
  return raw;
}
