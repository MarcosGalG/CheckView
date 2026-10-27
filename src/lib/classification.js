// Move classification and accuracy, based on how much winning chance each move gives away.

import { Chess } from "../../vendor/chess.js/chess.js";

export const CLASSIFICATIONS = [
  "brilliant", "great", "best", "excellent", "good", "book",
  "inaccuracy", "mistake", "miss", "blunder",
];

// Maximum win-chance loss (in percentage points) for each quality band.
const THRESHOLDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 };

// A best move is "great" when the second-best move is at least this much worse.
const ONLY_MOVE_GAP = 15;

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Expected winning chances (0–100) for a centipawn score, using the Lichess logistic model. */
export function winPercent(cp) {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Lichess per-move accuracy formula, from the win-chance loss. */
export function moveAccuracy(winLoss) {
  const accuracy = 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

function winPercentFor(evaluation, color) {
  return winPercent(color === "w" ? evaluation.cp : -evaluation.cp);
}

function opponentOf(color) {
  return color === "w" ? "b" : "w";
}

/**
 * A piece (not a pawn) left where the opponent can take it at a profit:
 * either undefended, or attacked by a cheaper piece. Even trades and winning captures don't count.
 */
function isSacrifice(move) {
  if (move.piece === "p" || move.piece === "k") return false;

  const moved = PIECE_VALUES[move.piece];
  const gained = move.captured ? PIECE_VALUES[move.captured] : 0;
  if (gained >= moved) return false;

  const board = new Chess(move.fenAfter);
  const defended = board.attackers(move.to, move.color).length > 0;
  const attackerValues = board
    .attackers(move.to, opponentOf(move.color))
    .map((square) => board.get(square).type)
    .filter((type) => type !== "k" || !defended)
    .map((type) => PIECE_VALUES[type]);

  if (attackerValues.length === 0) return false;
  return !defended || Math.min(...attackerValues) < moved;
}

function isRecapture(move, previous) {
  return Boolean(previous?.captured && move.captured && previous.to === move.to);
}

function baseClassification(move, winLoss) {
  if (move.isBest) return "best";
  if (winLoss <= THRESHOLDS.excellent) return "excellent";
  if (winLoss <= THRESHOLDS.good) return "good";
  if (winLoss <= THRESHOLDS.inaccuracy) return "inaccuracy";
  if (winLoss <= THRESHOLDS.mistake) return "mistake";
  return "blunder";
}

/**
 * Adds `classification`, `winLoss` and `accuracy` to every analyzed move.
 * Book moves are not evaluated, so they carry no win chances and don't count towards accuracy.
 */
export function classifyMoves(moves) {
  const classified = [];

  for (const move of moves) {
    if (move.isBook) {
      classified.push({ ...move, classification: "book", winBefore: null, winLoss: 0, accuracy: null });
      continue;
    }

    const previous = classified.at(-1);
    const winBefore = winPercentFor(move.evalBefore, move.color);
    const winAfter = winPercentFor(move.evalAfter, move.color);
    const winLoss = move.isBest ? 0 : Math.max(0, winBefore - winAfter);

    let classification = baseClassification(move, winLoss);

    // Failing to punish the opponent's mistake, without ending up worse than before it.
    if (
      (classification === "mistake" || classification === "blunder") &&
      (previous?.classification === "mistake" || previous?.classification === "blunder") &&
      winAfter >= 100 - previous.winBefore
    ) {
      classification = "miss";
    }

    if (
      classification === "best" &&
      move.secondBestEval &&
      !isRecapture(move, previous) &&
      winBefore - winPercentFor(move.secondBestEval, move.color) >= ONLY_MOVE_GAP
    ) {
      classification = "great";
    }

    if (
      (classification === "best" || classification === "great" || classification === "excellent") &&
      winAfter >= 50 &&
      winBefore < 95 &&
      isSacrifice(move)
    ) {
      classification = "brilliant";
    }

    classified.push({ ...move, classification, winBefore, winLoss, accuracy: moveAccuracy(winLoss) });
  }

  return classified;
}

/** Per-color accuracy (mean over non-book moves) and number of moves in each classification. */
export function summarize(moves) {
  const summary = {};
  for (const color of ["w", "b"]) {
    const own = moves.filter((move) => move.color === color);
    const counts = Object.fromEntries(CLASSIFICATIONS.map((name) => [name, 0]));
    for (const move of own) counts[move.classification]++;
    const scored = own.filter((move) => move.accuracy !== null);
    const accuracy = scored.length > 0 ? scored.reduce((sum, move) => sum + move.accuracy, 0) / scored.length : null;
    summary[color] = { accuracy, counts };
  }
  return summary;
}
