import {
  CENTER_INDEX, MAX_TASK_LENGTH, RECLAIM_RETRY_COOLDOWN_MS, dealBoard, nameKey, normalizeName, parseMentions,
  type AddTaskRes, type CreateGameRes, type JoinGameRes, type ReclaimDoc,
} from 'game-core';
import { AppError } from '../errors';
import type { Section } from '../protocol';
import type { GameRow, GameState } from './state';

/** Most seats a game may hold. */
const MAX_SEATS = 50;
/** Most pool tasks a game may hold. */
const MAX_TASKS = 500;

/** Who is acting and the only sources of time, randomness and ids an operation may use. */
export interface OpCtx { uid: string; now: number; rng: () => number; newId: () => string }

/** What to broadcast after an operation: sections for everyone, per-seat extras, evictions and reclaim notices (all by uid except `perSeat`, by seatId). */
export interface Push {
  all: Section[];
  perSeat?: Record<string, Section[]>;
  evictUids?: string[];
  reclaimNotify?: Array<{ uid: string; id: string; status: ReclaimDoc['status'] }>;
}

/** An operation's reply plus the push it causes. */
export interface OpOut<T> { result: T; push: Push }

/** The game row, or `game-not-found`. */
function requireGame(state: GameState): GameRow {
  if (!state.game) throw new AppError('game-not-found');
  return state.game;
}

/** The caller's seatId, or `permission-denied` for a non-member. */
function requireMember(state: GameState, uid: string): string {
  const seatId = state.seatOf(uid);
  if (!seatId) throw new AppError('permission-denied');
  return seatId;
}

/** Throws `wrong-stage` unless the game is in the lobby. */
function requireLobby(game: GameRow): void {
  if (game.stage !== 'lobby') throw new AppError('wrong-stage');
}

/**
 * Creates the game on an empty room with the caller as host.
 * @throws AppError `resource-exhausted` if the room already holds a game (caller retries with another code); `invalid-name`.
 */
export function claimGame(state: GameState, ctx: OpCtx, args: { gameId: string; code: string; name: string }): OpOut<CreateGameRes> {
  if (state.game) throw new AppError('resource-exhausted');
  const name = normalizeName(args.name);
  if (!name) throw new AppError('invalid-name');
  const seatId = ctx.newId();
  state.putGame({
    gameId: args.gameId, code: args.code, stage: 'lobby', hostSeatId: seatId, createdAt: ctx.now,
    bingoCount: 0, reviewGate: false, rev: 0, lastMutationAt: ctx.now,
  });
  state.putSeat({ seatId, name, nameKey: nameKey(name), joinedAt: ctx.now });
  state.putMember(ctx.uid, seatId);
  return { result: { gameId: args.gameId, code: args.code, seatId }, push: { all: ['game', 'seats', 'view'] } };
}

/**
 * Joins: resumes a member, files a reclaim on a name clash, else seats the caller (dealing a board when playing).
 * @throws AppError `game-not-found`, `game-ended`, `invalid-name`, `reclaim-cooldown`, `resource-exhausted`, `not-ready`.
 */
export function join(state: GameState, ctx: OpCtx, args: { name: string }): OpOut<JoinGameRes> {
  const game = requireGame(state);
  const existing = state.seatOf(ctx.uid);
  if (existing) return { result: { status: 'resumed', gameId: game.gameId, seatId: existing }, push: { all: [] } };
  if (game.stage === 'ended') throw new AppError('game-ended');
  const name = normalizeName(args.name);
  if (!name) throw new AppError('invalid-name');

  const key = nameKey(name);
  const taken = [...state.seats.values()].find((s) => s.nameKey === key);
  if (taken) {
    const mine = [...state.reclaims.values()].filter((r) => r.requesterUid === ctx.uid && r.seatId === taken.seatId);
    const pending = mine.find((r) => r.status === 'pending');
    if (pending) return { result: { status: 'reclaim-pending', gameId: game.gameId, reclaimId: pending.id }, push: { all: [] } };
    if (mine.some((r) => r.status === 'denied' && ctx.now - (r.resolvedAt ?? r.createdAt) < RECLAIM_RETRY_COOLDOWN_MS)) {
      throw new AppError('reclaim-cooldown');
    }
    const id = ctx.newId();
    state.putReclaim({ id, requesterUid: ctx.uid, name, seatId: taken.seatId, status: 'pending', createdAt: ctx.now });
    return {
      result: { status: 'reclaim-pending', gameId: game.gameId, reclaimId: id },
      push: { all: [], perSeat: { [game.hostSeatId]: ['reclaims'] } },
    };
  }

  if (state.seats.size >= MAX_SEATS) throw new AppError('resource-exhausted');
  const seatId = ctx.newId();
  const seat = { seatId, name, nameKey: key, joinedAt: ctx.now };
  const push: Push = { all: ['game', 'seats', 'view'] };
  let board = null;
  if (game.stage === 'playing') {
    let cells;
    try {
      cells = dealBoard(state.poolTasks(), [...state.seatList(), { seatId, name, joinedAt: ctx.now }], seatId, ctx.rng);
    } catch {
      throw new AppError('not-ready');
    }
    const marks = Array<boolean>(25).fill(false);
    marks[CENTER_INDEX] = true;
    board = { seatId, cells, marks, completedLines: [], announcedLines: [] };
    push.perSeat = { [seatId]: ['board'] };
  }
  state.putSeat(seat);
  state.putMember(ctx.uid, seatId);
  if (board) state.putBoard(board);
  return { result: { status: 'joined', gameId: game.gameId, seatId }, push };
}

/**
 * Adds a pool task in the lobby; idempotent on a repeated `taskId` by the same author.
 * @throws AppError `permission-denied`, `wrong-stage`, `invalid-text`, `unknown-mention` (details.token), `self-mention`, `resource-exhausted`.
 */
export function addTask(state: GameState, ctx: OpCtx, args: { taskId: string; text: string }): OpOut<AddTaskRes> {
  const game = requireGame(state);
  const seatId = requireMember(state, ctx.uid);
  requireLobby(game);
  const prior = state.tasks.get(args.taskId);
  if (prior) {
    if (prior.authorSeatId === seatId) return { result: { taskId: args.taskId }, push: { all: [] } };
    throw new AppError('invalid-argument');
  }
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text || text.length > MAX_TASK_LENGTH) throw new AppError('invalid-text');
  if (state.tasks.size >= MAX_TASKS) throw new AppError('resource-exhausted');
  const parsed = parseMentions(text, state.seatList());
  if (!parsed.ok) throw new AppError('unknown-mention', { token: parsed.token });
  if (parsed.mentions.seatIds.includes(seatId)) throw new AppError('self-mention');
  state.putTask({ taskId: args.taskId, text, authorSeatId: seatId, mentions: parsed.mentions, createdAt: ctx.now });
  return { result: { taskId: args.taskId }, push: { all: ['game', 'view'] } };
}

/**
 * Deletes a pool task in the lobby (author or host).
 * @throws AppError `permission-denied`, `wrong-stage`, `not-found`.
 */
export function deleteTask(state: GameState, ctx: OpCtx, args: { taskId: string }): OpOut<Record<string, never>> {
  const game = requireGame(state);
  const seatId = requireMember(state, ctx.uid);
  requireLobby(game);
  const target = state.tasks.get(args.taskId);
  if (!target) throw new AppError('not-found');
  if (target.authorSeatId !== seatId && game.hostSeatId !== seatId) throw new AppError('permission-denied');
  state.deleteTask(args.taskId);
  return { result: {}, push: { all: ['game', 'view'] } };
}
