import { Chess } from "../../vendor/chess.js/chess.js";

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

/**
 * Evaluates every position of a PGN game.
 * Each move gets the evaluation before it (best play) and after it (what was actually played),
 * both from White's point of view, plus the engine's preferred move.
 */
export async function analyzeGame(pgn, engine, { depth = DEFAULT_DEPTH, onProgress } = {}) {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });

  const fens = history.length > 0 ? [history[0].before, ...history.map((m) => m.after)] : [game.fen()];
  const evaluations = [];
  for (const fen of fens) {
    evaluations.push(await engine.evaluate(fen, { depth }));
    onProgress?.(evaluations.length, fens.length);
  }

  const moves = history.map((move, i) => {
    const before = evaluations[i];
    const after = evaluations[i + 1];
    const uci = move.from + move.to + (move.promotion ?? "");
    return {
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color,
      san: move.san,
      uci,
      fenBefore: move.before,
      fenAfter: move.after,
      evalBefore: { cp: before.cp, mate: before.mate },
      evalAfter: { cp: after.cp, mate: after.mate },
      bestMove: before.bestMove,
      bestMoveSan: uciToSan(move.before, before.bestMove),
      isBest: uci === before.bestMove,
    };
  });

  return { depth, moves };
}
