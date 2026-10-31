import {
  CENTER_INDEX, MAX_TASK_LENGTH, RECLAIM_RETRY_COOLDOWN_MS, applyMark, assignAnyone, dealBoard, nameKey, normalizeName, parseMentions, shortfalls,
  type AddTaskRes, type CreateGameRes, type JoinGameRes, type ReclaimDoc, type ToggleMarkRes,
} from 'game-core';
import { AppError } from '../errors';
import type { Op, Section } from '../protocol';
import { ALL_SECTIONS } from './sections';
import type { GameRow, GameState } from './state';

/** Most seats a game may hold. */
const MAX_SEATS = 50;
/** Most pool tasks a game may hold. */
const MAX_TASKS = 500;
/** Longest client-chosen `taskId` (clients send UUIDs, 36 chars). */
export const MAX_TASK_ID_LENGTH = 64;

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

/** Returns `taskId` when it is a non-empty string of at most `MAX_TASK_ID_LENGTH` chars, else throws `invalid-argument`. */
function requireTaskId(taskId: unknown): string {
  if (typeof taskId !== 'string' || !taskId || taskId.length > MAX_TASK_ID_LENGTH) throw new AppError('invalid-argument');
  return taskId;
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
    bingoCount: 0, reviewGate: false, freeSpace: false, rev: 0, lastMutationAt: ctx.now,
  });
  state.putSeat({ seatId, name, nameKey: nameKey(name), joinedAt: ctx.now });
  state.putMember(ctx.uid, seatId);
  return { result: { gameId: args.gameId, code: args.code, seatId }, push: { all: ['game', 'seats', 'view'] } };
}

/** A fresh board's marks: all clear, except the centre when the game has free space. */
function freshMarks(freeSpace: boolean): boolean[] {
  const marks = Array<boolean>(25).fill(false);
  if (freeSpace) marks[CENTER_INDEX] = true;
  return marks;
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
    // An `@anyone` task already on some board stays on that one board; plain tasks are shared across boards.
    const excludeTaskIds = new Set<string>();
    for (const b of state.boards.values()) {
      for (const c of b.cells) if (c.kind === 'task' && state.tasks.get(c.taskId)?.mentions.anyone) excludeTaskIds.add(c.taskId);
    }
    let cells;
    try {
      cells = dealBoard(state.poolTasks(), [...state.seatList(), { seatId, name, joinedAt: ctx.now }], seatId, ctx.rng, {
        freeSpace: game.freeSpace, excludeTaskIds,
      });
    } catch {
      throw new AppError('not-ready');
    }
    board = { seatId, cells, marks: freshMarks(game.freeSpace), completedLines: [], announcedLines: [] };
    push.all.push('standings');
    push.perSeat = { [seatId]: ['board'] };
  }
  state.putSeat(seat);
  state.putMember(ctx.uid, seatId);
  if (board) state.putBoard(board);
  return { result: { status: 'joined', gameId: game.gameId, seatId }, push };
}

/**
 * Adds a pool task in the lobby; idempotent on a repeated `taskId` by the same author.
 * @throws AppError `permission-denied`, `wrong-stage`, `invalid-argument` (bad `taskId`), `invalid-text`,
 *   `unknown-mention` (details.token), `self-mention`, `resource-exhausted`.
 */
export function addTask(state: GameState, ctx: OpCtx, args: { taskId: string; text: string }): OpOut<AddTaskRes> {
  const game = requireGame(state);
  const seatId = requireMember(state, ctx.uid);
  requireLobby(game);
  const taskId = requireTaskId(args.taskId);
  const prior = state.tasks.get(taskId);
  if (prior) {
    if (prior.authorSeatId === seatId) return { result: { taskId }, push: { all: [] } };
    throw new AppError('invalid-argument');
  }
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text || text.length > MAX_TASK_LENGTH) throw new AppError('invalid-text');
  if (state.tasks.size >= MAX_TASKS) throw new AppError('resource-exhausted');
  const parsed = parseMentions(text, state.seatList());
  if (!parsed.ok) throw new AppError('unknown-mention', { token: parsed.token });
  if (parsed.mentions.seatIds.includes(seatId)) throw new AppError('self-mention');
  state.putTask({ taskId, text, authorSeatId: seatId, mentions: parsed.mentions, createdAt: ctx.now });
  return { result: { taskId }, push: { all: ['game', 'view'] } };
}

/**
 * Host-only, lobby-only: sets the game's options (today only `freeSpace`).
 * @throws AppError `game-not-found`, `permission-denied`, `not-host`, `wrong-stage`, `invalid-argument` (non-boolean `freeSpace`).
 */
export function setOptions(state: GameState, ctx: OpCtx, args: { freeSpace?: unknown }): OpOut<Record<string, never>> {
  const game = requireGame(state);
  requireHost(state, game, ctx.uid);
  requireLobby(game);
  if (typeof args.freeSpace !== 'boolean') throw new AppError('invalid-argument');
  state.putGame({ ...game, freeSpace: args.freeSpace });
  return { result: {}, push: { all: ['game'] } };
}

/**
 * Deletes a pool task in the lobby (author or host).
 * @throws AppError `permission-denied`, `wrong-stage`, `invalid-argument` (bad `taskId`), `not-found`.
 */
export function deleteTask(state: GameState, ctx: OpCtx, args: { taskId: string }): OpOut<Record<string, never>> {
  const game = requireGame(state);
  const seatId = requireMember(state, ctx.uid);
  requireLobby(game);
  const taskId = requireTaskId(args.taskId);
  const target = state.tasks.get(taskId);
  if (!target) throw new AppError('not-found');
  if (target.authorSeatId !== seatId && game.hostSeatId !== seatId) throw new AppError('permission-denied');
  state.deleteTask(taskId);
  return { result: {}, push: { all: ['game', 'view'] } };
}

/** Throws `not-host` unless the caller holds the host seat; returns that seatId. */
function requireHost(state: GameState, game: GameRow, uid: string): string {
  const seatId = requireMember(state, uid);
  if (seatId !== game.hostSeatId) throw new AppError('not-host');
  return seatId;
}

/**
 * Host-only: deals every seat a board and moves the lobby to `playing`. Each `@anyone` task is assigned to
 * exactly one seat first (`assignAnyone`), so it lands on one board.
 * @throws AppError `game-not-found`, `permission-denied`, `not-host`, `wrong-stage`, `not-ready` (details.shortfalls).
 */
export function launch(state: GameState, ctx: OpCtx, _args: Record<string, never>): OpOut<Record<string, never>> {
  const game = requireGame(state);
  requireHost(state, game, ctx.uid);
  requireLobby(game);
  const tasks = state.poolTasks();
  const seats = state.seatList();
  const { freeSpace } = game;
  const short = shortfalls(tasks, seats, { freeSpace });
  if (Object.keys(short).length > 0) throw new AppError('not-ready', { shortfalls: short });
  const anyoneAssignment = assignAnyone(tasks, seats, ctx.rng);
  const perSeat: Record<string, Section[]> = {};
  for (const seat of seats) {
    const cells = dealBoard(tasks, seats, seat.seatId, ctx.rng, { freeSpace, anyoneAssignment });
    state.putBoard({ seatId: seat.seatId, cells, marks: freshMarks(freeSpace), completedLines: [], announcedLines: [] });
    perSeat[seat.seatId] = ['board'];
  }
  state.putGame({ ...game, stage: 'playing', launchedAt: ctx.now });
  return { result: {}, push: { all: ['game', 'standings'], perSeat } };
}

/**
 * Sets (`marked` given) or flips (omitted) one square; each newly completed line appends an announced bingo.
 * Pushes the caller's board and everyone's standings. A set to the value already held changes nothing and pushes nothing.
 * Without free space the centre is an ordinary square.
 * @throws AppError `invalid-cell`, `game-not-found`, `permission-denied`, `wrong-stage`.
 */
export function mark(state: GameState, ctx: OpCtx, args: { cellIndex: number; marked?: boolean }): OpOut<ToggleMarkRes> {
  const { cellIndex, marked } = args;
  if (typeof cellIndex !== 'number' || !Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 24) throw new AppError('invalid-cell');
  if (marked !== undefined && typeof marked !== 'boolean') throw new AppError('invalid-cell');
  const game = requireGame(state);
  const seatId = requireMember(state, ctx.uid);
  const board = state.boards.get(seatId);
  if (game.stage !== 'playing' || !board) throw new AppError('wrong-stage');
  const applied = applyMark(board, cellIndex, marked, { freeSpace: game.freeSpace });
  if (!applied.changed && marked !== undefined) {
    return { result: { marks: board.marks, completedLines: board.completedLines, newBingoSeqs: [] }, push: { all: [] } };
  }
  const announcedLines = [...board.announcedLines];
  const newBingoSeqs: number[] = [];
  let bingoCount = game.bingoCount;
  const name = state.seats.get(seatId)?.name ?? '';
  for (const line of applied.newLines) {
    const seq = ++bingoCount;
    state.appendBingo({
      id: ctx.newId(), seq, seatId, name, line, playerBingoNumber: announcedLines.length + 1, at: ctx.now, status: 'announced',
    });
    announcedLines.push(line);
    newBingoSeqs.push(seq);
  }
  state.putBoard({ ...board, marks: applied.marks, completedLines: applied.completedLines, announcedLines });
  const push: Push = { all: ['standings'], perSeat: { [seatId]: ['board'] } };
  if (newBingoSeqs.length) {
    state.putGame({ ...game, bingoCount });
    push.all = ['bingos', 'game', 'standings'];
  }
  return { result: { marks: applied.marks, completedLines: applied.completedLines, newBingoSeqs }, push };
}

/**
 * Host-only: ends a game from the lobby or while playing; an already-ended game is `wrong-stage`.
 * @throws AppError `game-not-found`, `permission-denied`, `not-host`, `wrong-stage`.
 */
export function end(state: GameState, ctx: OpCtx, _args: Record<string, never>): OpOut<Record<string, never>> {
  const game = requireGame(state);
  requireHost(state, game, ctx.uid);
  if (game.stage === 'ended') throw new AppError('wrong-stage');
  state.putGame({ ...game, stage: 'ended', endedAt: ctx.now });
  return { result: {}, push: { all: ['game', 'standings'] } };
}

/**
 * Host-only: approves or denies a pending seat reclaim; approval re-points the seat at the requester (any stage).
 * A requester who already holds a seat, or a claim on the host's own seat, commits a denial and then throws `wrong-stage` carrying `push` (the requester's denial notice).
 * @throws AppError `game-not-found`, `permission-denied`, `not-host`, `reclaim-not-found`, `invalid-argument`, `wrong-stage`.
 */
export function resolveReclaim(state: GameState, ctx: OpCtx, args: { reclaimId: string; approve: boolean }): OpOut<Record<string, never>> {
  const { reclaimId, approve } = args;
  if (typeof reclaimId !== 'string' || !reclaimId || reclaimId.includes('/')) throw new AppError('reclaim-not-found');
  if (typeof approve !== 'boolean') throw new AppError('invalid-argument');
  const game = requireGame(state);
  const hostSeat = requireHost(state, game, ctx.uid);
  const reclaim = state.reclaims.get(reclaimId);
  if (!reclaim) throw new AppError('reclaim-not-found');
  if (reclaim.status !== 'pending') throw new AppError('wrong-stage');
  const resolve = (r: typeof reclaim, status: 'approved' | 'denied') => state.putReclaim({ ...r, status, resolvedAt: ctx.now });
  if (!approve) {
    resolve(reclaim, 'denied');
    return {
      result: {},
      push: { all: [], perSeat: { [hostSeat]: ['reclaims'] }, reclaimNotify: [{ uid: reclaim.requesterUid, id: reclaimId, status: 'denied' }] },
    };
  }
  if (state.seatOf(reclaim.requesterUid) !== null || reclaim.seatId === hostSeat) {
    resolve(reclaim, 'denied');
    throw new AppError('wrong-stage', undefined, {
      all: [], perSeat: { [hostSeat]: ['reclaims'] }, reclaimNotify: [{ uid: reclaim.requesterUid, id: reclaimId, status: 'denied' }],
    });
  }
  const evictUids = [...state.members].filter(([, seat]) => seat === reclaim.seatId).map(([uid]) => uid);
  for (const uid of evictUids) state.deleteMember(uid);
  state.putMember(reclaim.requesterUid, reclaim.seatId);
  resolve(reclaim, 'approved');
  const reclaimNotify: NonNullable<Push['reclaimNotify']> = [{ uid: reclaim.requesterUid, id: reclaimId, status: 'approved' }];
  for (const other of [...state.reclaims.values()]) {
    if (other.id !== reclaimId && other.seatId === reclaim.seatId && other.status === 'pending') {
      resolve(other, 'denied');
      reclaimNotify.push({ uid: other.requesterUid, id: other.id, status: 'denied' });
    }
  }
  return {
    result: {},
    push: { all: [], perSeat: { [hostSeat]: ['reclaims'], [reclaim.seatId]: ALL_SECTIONS.slice() }, evictUids, reclaimNotify },
  };
}

/** Sets the host seat and builds the push that moves the reclaims section from the old host to the new one. */
function setHost(state: GameState, game: GameRow, toSeatId: string): OpOut<Record<string, never>> {
  if (typeof toSeatId !== 'string' || !toSeatId || toSeatId.includes('/') || !state.seats.has(toSeatId)) throw new AppError('unknown-seat');
  const oldHost = game.hostSeatId;
  state.putGame({ ...game, hostSeatId: toSeatId });
  return { result: {}, push: { all: ['game'], perSeat: { [oldHost]: ['reclaims'], [toSeatId]: ['reclaims'] } } };
}

/**
 * Host-only: hands the host role to another seat (any stage).
 * @throws AppError `game-not-found`, `permission-denied`, `not-host`, `unknown-seat`.
 */
export function transferHost(state: GameState, ctx: OpCtx, args: { toSeatId: string }): OpOut<Record<string, never>> {
  const game = requireGame(state);
  requireHost(state, game, ctx.uid);
  return setHost(state, game, args.toSeatId);
}

/**
 * Operator action: like `transferHost` with no caller and no host check.
 * @throws AppError `game-not-found`, `unknown-seat`.
 */
export function adminTransferHost(state: GameState, _ctx: { now: number }, args: { seatId: string }): OpOut<Record<string, never>> {
  return setHost(state, requireGame(state), args.seatId);
}

/** Every seat with whether some uid holds it and whether it is the host's. */
export function adminSeats(state: GameState): Array<{ seatId: string; name: string; occupied: boolean; host: boolean }> {
  const held = new Set(state.members.values());
  return [...state.seats.values()].map((s) => ({
    seatId: s.seatId, name: s.name, occupied: held.has(s.seatId), host: s.seatId === state.game?.hostSeatId,
  }));
}

/** Every client-callable operation by its protocol name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OPS: Record<Op, (state: GameState, ctx: OpCtx, args: any) => OpOut<unknown>> = {
  join, addTask, deleteTask, launch, mark, end, resolveReclaim, transferHost, setOptions,
};
