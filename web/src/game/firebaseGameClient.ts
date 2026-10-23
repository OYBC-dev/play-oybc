import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { BingoDoc, BoardDoc, GameDoc, ReclaimDoc, SeatDoc, ViewDoc } from 'game-core';
import { api } from '../firebase/api';
import { firebase } from '../firebase/app';
import { ensureSignedIn } from '../firebase/session';
import type { GameClient, GameSnapshot } from './GameClient';

/** Real GameClient: callables for writes, Firestore listeners for reads. */
export const firebaseGameClient: GameClient = {
  createGame: (name) => api.createGame({ name }),
  joinGame: (code, name) => api.joinGame({ code, name }),
  whoAmI: (code) => api.whoAmI({ code }),
  addTask: async (gameId, text) => { await api.addTask({ gameId, text }); },
  deleteTask: async (gameId, taskId) => { await api.deleteTask({ gameId, taskId }); },
  launch: async (gameId) => { await api.launchGame({ gameId }); },
  toggleMark: (gameId, cellIndex) => api.toggleMark({ gameId, cellIndex }),
  end: async (gameId) => { await api.endGame({ gameId }); },
  resolveReclaim: async (gameId, reclaimId, approve) => { await api.resolveReclaim({ gameId, reclaimId, approve }); },
  transferHost: async (gameId, toSeatId) => { await api.transferHost({ gameId, toSeatId }); },

  subscribe(gameId, seatId, onChange, onError) {
    const unsubs: Array<() => void> = [];
    let closed = false;
    let hostListening = false;
    let stopReclaims: (() => void) | null = null;

    const state: {
      game?: GameDoc; seats?: GameSnapshot['seats']; view?: GameSnapshot['view'];
      board?: BoardDoc | null; bingos?: BingoDoc[]; reclaims: GameSnapshot['reclaims'];
    } = { reclaims: [] };
    const fail = (e: Error) => { if (!closed) onError(e); };
    const emit = () => {
      const { game, seats, view, board, bingos } = state;
      if (closed || !game || !seats || !view || board === undefined || !bingos) return;
      onChange({ game, mySeatId: seatId, seats, view, board, bingos, reclaims: state.reclaims });
    };

    const setReclaimListener = (isHost: boolean, db: ReturnType<typeof firebase>['db']) => {
      if (isHost === hostListening) return;
      hostListening = isHost;
      stopReclaims?.();
      stopReclaims = null;
      if (!isHost) { state.reclaims = []; return; }
      stopReclaims = onSnapshot(
        query(collection(db, 'games', gameId, 'reclaims'), where('status', '==', 'pending')),
        (snap) => {
          state.reclaims = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ReclaimDoc) }));
          emit();
        },
        fail,
      );
    };

    void ensureSignedIn().then(() => {
      if (closed) return;
      const { db } = firebase();
      unsubs.push(
        onSnapshot(doc(db, 'games', gameId), (s) => {
          if (!s.exists()) {
            // An offline cache miss is not a missing game; only a server-confirmed absence is.
            if (s.metadata.fromCache) return;
            fail(Object.assign(new Error('game-not-found'), { details: { code: 'game-not-found' } }));
            return;
          }
          state.game = s.data() as GameDoc;
          setReclaimListener(state.game.hostSeatId === seatId, db);
          emit();
        }, fail),
        onSnapshot(collection(db, 'games', gameId, 'seats'), (s) => {
          state.seats = s.docs.map((d) => ({ seatId: d.id, ...(d.data() as SeatDoc) }));
          emit();
        }, fail),
        onSnapshot(doc(db, 'games', gameId, 'views', seatId), (s) => {
          state.view = s.exists() ? (s.data() as ViewDoc).entries : [];
          emit();
        }, fail),
        onSnapshot(doc(db, 'games', gameId, 'boards', seatId), (s) => {
          state.board = s.exists() ? (s.data() as BoardDoc) : null;
          emit();
        }, fail),
        onSnapshot(
          query(collection(db, 'games', gameId, 'bingos'), where('status', '==', 'announced'), orderBy('seq')),
          (s) => {
            state.bingos = s.docs.map((d) => d.data() as BingoDoc);
            emit();
          },
          fail,
        ),
      );
    }).catch((e) => fail(e as Error));

    return () => {
      closed = true;
      unsubs.forEach((u) => u());
      stopReclaims?.();
    };
  },

  watchReclaim(gameId, reclaimId, onStatus, onError) {
    let unsub: (() => void) | null = null;
    let closed = false;
    void ensureSignedIn().then(() => {
      if (closed) return;
      unsub = onSnapshot(
        doc(firebase().db, 'games', gameId, 'reclaims', reclaimId),
        (s) => { if (s.exists()) onStatus((s.data() as ReclaimDoc).status); },
        (e) => { if (!closed) onError?.(e); },
      );
    }).catch((e) => { if (!closed) onError?.(e as Error); });
    return () => { closed = true; unsub?.(); };
  },
};
