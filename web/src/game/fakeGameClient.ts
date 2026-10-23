import type { CreateGameRes, JoinGameRes, ReclaimDoc, ToggleMarkRes, WhoAmIRes } from 'game-core';
import type { GameClient, GameSnapshot } from './GameClient';

/** Error shaped like a callable failure, for tests. */
export function appError(code: string): Error & { details: { code: string } } {
  return Object.assign(new Error(code), { details: { code } });
}

/** In-memory GameClient for component tests; every response is a settable field. */
export class FakeGameClient implements GameClient {
  calls: Array<[string, ...unknown[]]> = [];
  createResult: CreateGameRes | Error = { gameId: 'g1', code: 'ABCDE', seatId: 's1' };
  joinResult: JoinGameRes | Error = { status: 'joined', gameId: 'g1', seatId: 's2' };
  whoAmIResult: WhoAmIRes | Error = null;
  snapshot: GameSnapshot | null = null;
  private snapshotListeners = new Set<(s: GameSnapshot) => void>();
  private reclaimListeners = new Set<(s: ReclaimDoc['status']) => void>();

  private async result<T>(name: string, args: unknown[], value: T | Error): Promise<T> {
    this.calls.push([name, ...args]);
    if (value instanceof Error) throw value;
    return value;
  }

  createGame(name: string) { return this.result('createGame', [name], this.createResult); }
  joinGame(code: string, name: string) { return this.result('joinGame', [code, name], this.joinResult); }
  whoAmI(code: string) { return this.result('whoAmI', [code], this.whoAmIResult); }

  subscribe(gameId: string, seatId: string, onChange: (s: GameSnapshot) => void): () => void {
    this.calls.push(['subscribe', gameId, seatId]);
    this.snapshotListeners.add(onChange);
    if (this.snapshot) {
      const s = this.snapshot;
      queueMicrotask(() => onChange(s));
    }
    return () => this.snapshotListeners.delete(onChange);
  }

  /** Push a snapshot to every active subscriber. */
  emit(s: GameSnapshot): void {
    this.snapshot = s;
    this.snapshotListeners.forEach((l) => l(s));
  }

  addTask(gameId: string, text: string) { return this.result('addTask', [gameId, text], undefined); }
  deleteTask(gameId: string, taskId: string) { return this.result('deleteTask', [gameId, taskId], undefined); }
  launch(gameId: string) { return this.result('launch', [gameId], undefined); }
  end(gameId: string) { return this.result('end', [gameId], undefined); }
  toggleMark(gameId: string, cellIndex: number) {
    return this.result<ToggleMarkRes>('toggleMark', [gameId, cellIndex], { marks: [], completedLines: [], newBingoSeqs: [] });
  }
  resolveReclaim(gameId: string, reclaimId: string, approve: boolean) {
    return this.result('resolveReclaim', [gameId, reclaimId, approve], undefined);
  }
  transferHost(gameId: string, toSeatId: string) { return this.result('transferHost', [gameId, toSeatId], undefined); }

  watchReclaim(gameId: string, reclaimId: string, onStatus: (s: ReclaimDoc['status']) => void): () => void {
    this.calls.push(['watchReclaim', gameId, reclaimId]);
    this.reclaimListeners.add(onStatus);
    return () => this.reclaimListeners.delete(onStatus);
  }

  /** Report a reclaim status change to watchers. */
  emitReclaim(status: ReclaimDoc['status']): void {
    this.reclaimListeners.forEach((l) => l(status));
  }
}
