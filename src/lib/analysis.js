import { Chess } from "../../vendor/chess.js/chess.js";
import { positionKey } from "./openings.js";

export const DEFAULT_DEPTH = 14;

function uciToSan(fen, uci) {
  if (!uci) return null;
  try {
    const move = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move.san;
  } catch {
    return null;
  }
}

function toUci(move) {
  return move.from + move.to + (move.promotion ?? "");
}

/** Number of leading moves whose resulting positions are all in the opening book. */
function countBookPlies(history, openings) {
  let plies = 0;
  while (plies < history.length && positionKey(history[plies].after) in openings) plies++;
  return plies;
}

/**
 * Evaluates a PGN game with a pool of engines working on different positions in parallel.
 *
 * Opening book moves are not evaluated, except for the last book position, which is the
 * starting point of the first move out of book. When the played move matches the engine's
 * choice, the position is searched again with MultiPV 2 to get the second-best evaluation,
 * used to detect "only moves"; the transposition table makes that second search cheap.
 * The table is cleared before every new position so results don't depend on scheduling.
 *
 * Each move gets the evaluation before it (best play) and after it (what was played),
 * both from White's point of view, plus the engine's preferred move.
 */
export async function analyzeGame(pgn, engines, { openings, depth = DEFAULT_DEPTH, onProgress } = {}) {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });

  const fens = history.length > 0 ? [history[0].before, ...history.map((m) => m.after)] : [game.fen()];
  const bookPlies = countBookPlies(history, openings);
  const pending = fens.map((_, i) => i).filter((i) => i >= bookPlies);
  const evaluations = new Array(fens.length).fill(null);

  let next = 0;
  let completed = 0;
  await Promise.all(engines.map(async (engine) => {
    while (next < pending.length) {
      const i = pending[next++];
      const played = history[i] ? toUci(history[i]) : null;
      await engine.reset();
      let result = await engine.evaluate(fens[i], { depth });
      if (played && result.bestMove === played) {
        result = await engine.evaluate(fens[i], { depth, multiPv: 2 });
      }
      evaluations[i] = result;
      onProgress?.(++completed, pending.length);
    }
  }));

  const moves = history.map((move, i) => {
    const before = evaluations[i];
    const after = evaluations[i + 1];
    const uci = toUci(move);
    const second = before?.lines[1];
    return {
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color,
      san: move.san,
      uci,
      piece: move.piece,
      captured: move.captured ?? null,
      to: move.to,
      fenBefore: move.before,
      fenAfter: move.after,
      isBook: i < bookPlies,
      evalBefore: before && { cp: before.cp, mate: before.mate },
      evalAfter: after && { cp: after.cp, mate: after.mate },
      bestMove: before?.bestMove ?? null,
      bestMoveSan: uciToSan(move.before, before?.bestMove),
      // Engine lines (UCI): best play from the position before the move, and the
      // opponent's best reply line after it. Used to explain the move.
      bestLine: before?.pv ?? [],
      replyLine: after?.pv ?? [],
      secondBestEval: second ? { cp: second.cp, mate: second.mate } : null,
      isBest: uci === before?.bestMove,
    };
  });

  return { depth, moves };
}
