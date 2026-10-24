import type { GameSnapshot } from './GameClient';

type Listener = { path: string; next: (s: unknown) => void; error: (e: Error) => void };
const listeners: Listener[] = [];

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => p.join('/'),
  collection: (_db: unknown, ...p: string[]) => p.join('/'),
  query: (path: string) => path,
  where: () => null,
  orderBy: () => null,
  onSnapshot: (path: string, next: Listener['next'], error: Listener['error']) => {
    listeners.push({ path, next, error });
    return () => {};
  },
}));
vi.mock('../firebase/app', () => ({ firebase: () => ({ db: {} }) }));
vi.mock('../firebase/session', () => ({ ensureSignedIn: () => Promise.resolve() }));
vi.mock('../firebase/api', () => ({ api: {} }));

const { firebaseGameClient } = await import('./firebaseGameClient');

const listener = (path: string) => {
  const l = listeners.find((x) => x.path === path);
  if (!l) throw new Error(`no listener on ${path}`);
  return l;
};
const docSnap = (data: unknown) => ({ exists: () => data !== undefined, data: () => data, metadata: { fromCache: false } });
const querySnap = (docs: Array<{ id: string; data: unknown }>) => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });

async function hostSubscribed() {
  listeners.length = 0;
  const onChange = vi.fn<(s: GameSnapshot) => void>();
  const onError = vi.fn<(e: Error) => void>();
  firebaseGameClient.subscribe('g1', 's1', onChange, onError);
  await Promise.resolve();
  await Promise.resolve();
  listener('games/g1').next(docSnap({ code: 'ABCDE', stage: 'playing', hostSeatId: 's1', createdAt: 0, bingoCount: 0, shortfalls: {}, reviewGate: false }));
  listener('games/g1/seats').next(querySnap([]));
  listener('games/g1/views/s1').next(docSnap({ entries: [] }));
  listener('games/g1/boards/s1').next(docSnap(undefined));
  listener('games/g1/bingos').next(querySnap([]));
  listener('games/g1/reclaims').next(querySnap([{ id: 'r1', data: { requesterUid: 'u', name: 'Cody', seatId: 's2', status: 'pending', createdAt: 0 } }]));
  return { onChange, onError };
}

describe('firebaseGameClient.subscribe', () => {
  it('a reclaims listener error clears the prompts and does not end the game', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { onChange, onError } = await hostSubscribed();
    expect(onChange.mock.lastCall?.[0].reclaims).toHaveLength(1);
    listener('games/g1/reclaims').error(new Error('permission-denied'));
    expect(onError).not.toHaveBeenCalled();
    expect(onChange.mock.lastCall?.[0].reclaims).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('any other listener error is still fatal', async () => {
    const { onError } = await hostSubscribed();
    listener('games/g1/seats').error(new Error('boom'));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
