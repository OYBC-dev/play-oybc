import { onCall } from 'firebase-functions/v2/https';
import { applyMark, type BingoDoc, type BoardDoc, type SeatDoc, type ToggleMarkReq, type ToggleMarkRes } from 'game-core';
import { requireMember, requireUid } from '../lib/auth';
import { appError } from '../lib/errors';
import { db, parseGameId, refs } from '../lib/gameRefs';
import { TX_OPTIONS } from '../lib/tx';

/**
 * Sets (`marked` given) or flips (`marked` omitted, 0.1.0 clients) one square; each newly completed line appends
 * an ordered, announced `bingos` entry. A set to the value the square already holds writes nothing.
 */
export const toggleMark = onCall<ToggleMarkReq, Promise<ToggleMarkRes>>(async (req) => {
  const uid = requireUid(req);
  const gameId = parseGameId(req.data?.gameId);
  const cellIndex = req.data?.cellIndex;
  if (typeof cellIndex !== 'number' || !Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 24) {
    throw appError('invalid-argument', 'invalid-cell');
  }
  const desired = req.data?.marked;
  if (desired !== undefined && typeof desired !== 'boolean') throw appError('invalid-argument', 'invalid-cell');

  return db.runTransaction(async (tx) => {
    const r = refs(gameId);
    const { seatId, game } = await requireMember(tx, gameId, uid);
    const [boardSnap, seatSnap] = await Promise.all([tx.get(r.board(seatId)), tx.get(r.seat(seatId))]);
    if (game.stage !== 'playing') throw appError('failed-precondition', 'wrong-stage');
    if (!boardSnap.exists || !seatSnap.exists) throw appError('failed-precondition', 'wrong-stage');
    const board = boardSnap.data() as BoardDoc;
    const { marks, completedLines, newLines, changed } = applyMark(board, cellIndex, desired);
    if (!changed && desired !== undefined) return { marks: board.marks, completedLines: board.completedLines, newBingoSeqs: [] };

    const announcedLines = [...board.announcedLines];
    let bingoCount = game.bingoCount;
    const newBingoSeqs: number[] = [];
    const name = (seatSnap.data() as SeatDoc).name;
    for (const line of newLines) {
      const seq = ++bingoCount;
      const bingo: BingoDoc = {
        seq, seatId, name, line, playerBingoNumber: announcedLines.length + 1, at: Date.now(), status: 'announced',
      };
      tx.set(r.bingos.doc(), bingo);
      announcedLines.push(line);
      newBingoSeqs.push(seq);
    }
    tx.update(r.board(seatId), { marks, completedLines, announcedLines });
    if (newBingoSeqs.length) tx.update(r.game, { bingoCount });
    return { marks, completedLines, newBingoSeqs };
  }, TX_OPTIONS);
});
