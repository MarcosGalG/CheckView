// Rule-based explanations for classified moves. Engine lines are replayed with chess.js to find
// what actually happens after a move: mates, material changes, forks and pawn-structure damage.
// Each explanation is a list of sentences { key, params } that the UI translates and renders.

import { Chess } from "../../vendor/chess.js/chess.js";

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// How far engine lines are followed to settle material (plies).
const LINE_PLIES = 8;

// Minimum material swing, in pawns, worth explaining as a lost or missed piece.
const MATERIAL_THRESHOLD = 2;

const MAX_SENTENCES = 2;

const GOOD = new Set(["brilliant", "great", "best", "excellent", "good"]);

// Material claims are only made when the evaluation confirms a real loss: on inaccuracies
// the engine line usually wins the material back a few moves later.
const MATERIAL_CLAIMS = new Set(["mistake", "miss", "blunder"]);

// Longest line shown when no single capture explains the loss.
const SHOWN_PLIES = 4;

/** White's material minus Black's, in pawns. */
function materialBalance(chess) {
  let balance = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (square) balance += (square.color === "w" ? 1 : -1) * PIECE_VALUES[square.type];
    }
  }
  return balance;
}

/**
 * Plays UCI moves from a position and records each step: SAN, mover, move number,
 * captured piece and material balance afterwards (from White's point of view).
 */
function playLine(fen, uciMoves, maxPlies = LINE_PLIES) {
  const chess = new Chess(fen);
  const steps = [];
  for (const uci of uciMoves.slice(0, maxPlies)) {
    const number = chess.moveNumber();
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    steps.push({
      san: move.san,
      color: move.color,
      number,
      captured: move.captured ?? null,
      balance: materialBalance(chess),
      mate: chess.isCheckmate(),
    });
  }
  return steps;
}

/**
 * Index of the step where material has settled: the last one not immediately followed by a
 * capture, so a line cut in the middle of an exchange doesn't count half of it.
 */
function settledIndex(steps) {
  let index = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i + 1]?.captured) index = i;
  }
  return index;
}

/**
 * Most valuable piece in `captured` that explains a swing of `amount`, or null.
 * Pawns are never named: a swing of two or more pawns isn't "a pawn".
 */
function pieceForSwing(captured, amount) {
  const candidates = captured
    .filter((type) => type !== "p" && PIECE_VALUES[type] <= amount + 1)
    .sort((a, b) => PIECE_VALUES[b] - PIECE_VALUES[a]);
  return candidates[0] ?? null;
}

/** The line up to the step where `color` captures a piece of `type` (or a few plies if none). */
function lineUntilCapture(steps, color, type) {
  const index = steps.findIndex((step) => step.color === color && step.captured === type);
  return steps.slice(0, index >= 0 ? index + 1 : SHOWN_PLIES);
}

/** Material change for `color` along a line, plus the pieces each side captured on the way. */
function materialOutcome(steps, startBalance, color) {
  const sign = color === "w" ? 1 : -1;
  if (steps.length === 0) return { change: 0, lost: [], won: [], settled: -1 };
  const settled = settledIndex(steps);
  const lost = [];
  const won = [];
  for (const step of steps.slice(0, settled + 1)) {
    if (!step.captured) continue;
    (step.color === color ? won : lost).push(step.captured);
  }
  return { change: (steps[settled].balance - startBalance) * sign, lost, won, settled };
}

function isMateFor(mate, color) {
  return mate !== null && mate !== undefined && mate !== 0 && Math.sign(mate) === (color === "w" ? 1 : -1);
}

/** Opponent pieces (worth a minor piece or more, or the king) attacked by the piece just moved. */
function forkTargets(fen, uci) {
  const chess = new Chess(fen);
  let move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return 0;
  }
  let targets = 0;
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square || square.color === move.color) continue;
      const valuable = square.type === "k" || PIECE_VALUES[square.type] >= 3;
      if (valuable && chess.attackers(square.square, move.color).includes(move.to)) targets++;
    }
  }
  return targets;
}

/** Pawn files and pawn squares of `color`. */
function pawns(chess, color) {
  const squares = [];
  for (const row of chess.board()) {
    for (const square of row) {
      if (square?.type === "p" && square.color === color) squares.push(square.square);
    }
  }
  return squares;
}

function doubledFiles(squares) {
  const counts = {};
  for (const square of squares) counts[square[0]] = (counts[square[0]] ?? 0) + 1;
  return Object.keys(counts).filter((file) => counts[file] > 1);
}

function isolatedPawns(squares) {
  const files = new Set(squares.map((square) => square[0]));
  const neighbours = (file) => [String.fromCharCode(file.charCodeAt(0) - 1), String.fromCharCode(file.charCodeAt(0) + 1)];
  return squares.filter((square) => !neighbours(square[0]).some((file) => files.has(file)));
}

/** A pawn in front of a castled king moved forward. */
function weakensKingShelter(move) {
  if (move.piece !== "p") return false;
  const before = new Chess(move.fenBefore);
  const kingSquare = before.findPiece({ type: "k", color: move.color })[0];
  const homeRank = move.color === "w" ? "1" : "8";
  if (!kingSquare || kingSquare[1] !== homeRank) return false;
  const shelterFiles = "gh".includes(kingSquare[0]) ? "fgh" : "bc".includes(kingSquare[0]) ? "abc" : null;
  const fromFile = move.uci[0];
  return Boolean(shelterFiles?.includes(fromFile));
}

function structureSentences(move) {
  const before = new Chess(move.fenBefore);
  const after = new Chess(move.fenAfter);
  const pawnsBefore = pawns(before, move.color);
  const pawnsAfter = pawns(after, move.color);

  const newDoubled = doubledFiles(pawnsAfter).filter((file) => !doubledFiles(pawnsBefore).includes(file));
  if (newDoubled.length > 0) return [{ key: "explain.doubled", params: { file: newDoubled[0] } }];

  const isolatedBefore = new Set(isolatedPawns(pawnsBefore).map((square) => square[0]));
  const newIsolated = isolatedPawns(pawnsAfter).filter((square) => !isolatedBefore.has(square[0]));
  if (newIsolated.length > 0) return [{ key: "explain.isolated", params: { square: newIsolated[0] } }];

  if (weakensKingShelter(move)) return [{ key: "explain.kingShelter" }];
  return [];
}

function lineParams(steps) {
  return steps.map(({ san, color, number }) => ({ san, color, number }));
}

function explainGoodMove(move) {
  if (isMateFor(move.evalAfter?.mate, move.color)) {
    return [{ key: "explain.mateIn", params: { n: Math.abs(move.evalAfter.mate) } }];
  }
  if (move.classification === "brilliant") return [{ key: "explain.brilliant", params: { piece: move.piece } }];
  if (move.classification === "great") return [{ key: "explain.great" }];
  if (move.classification === "best") return [{ key: "explain.best" }];
  return [];
}

/**
 * Explanation for an analyzed and classified move. Book moves are explained by the UI,
 * which knows the opening names.
 */
export function explainMove(move) {
  if (move.classification === "book") return [];
  if (new Chess(move.fenAfter).isCheckmate()) return [{ key: "explain.checkmate" }];
  if (GOOD.has(move.classification)) return explainGoodMove(move);

  const sentences = [];
  if (move.classification === "miss") sentences.push({ key: "explain.miss" });

  const start = materialBalance(new Chess(move.fenBefore));
  const played = playLine(move.fenBefore, [move.uci, ...move.replyLine]);
  const playedOutcome = materialOutcome(played, start, move.color);

  // What the move allows.
  const afterMate = move.evalAfter?.mate;
  const opponent = move.color === "w" ? "b" : "w";
  if (isMateFor(afterMate, opponent) && !isMateFor(move.evalBefore?.mate, opponent)) {
    const reply = playLine(move.fenAfter, move.replyLine, Math.abs(afterMate) * 2 - 1);
    sentences.push({ key: "explain.allowsMate", params: { n: Math.abs(afterMate), line: lineParams(reply) } });
  } else if (MATERIAL_CLAIMS.has(move.classification) && -playedOutcome.change >= MATERIAL_THRESHOLD) {
    const piece = pieceForSwing(playedOutcome.lost, -playedOutcome.change);
    const reply = played.slice(1, playedOutcome.settled + 1);
    sentences.push(piece
      ? { key: "explain.losesPiece", params: { piece, line: lineParams(lineUntilCapture(reply, opponent, piece)) } }
      : { key: "explain.losesMaterial", params: { line: lineParams(reply.slice(0, SHOWN_PLIES)) } });
  }

  // What the best move would have achieved.
  const bestMove = { san: move.bestMoveSan };
  if (isMateFor(move.evalBefore?.mate, move.color) && !isMateFor(afterMate, move.color)) {
    sentences.push({ key: "explain.missedMate", params: { n: Math.abs(move.evalBefore.mate), move: bestMove } });
  } else if (MATERIAL_CLAIMS.has(move.classification) && move.bestLine.length > 0) {
    const best = materialOutcome(playLine(move.fenBefore, move.bestLine), start, move.color);
    const missed = best.change - playedOutcome.change;
    const piece = pieceForSwing(best.won, best.change);
    if (best.change >= MATERIAL_THRESHOLD && missed >= MATERIAL_THRESHOLD && piece) {
      const fork = forkTargets(move.fenBefore, move.bestLine[0]) >= 2;
      sentences.push({ key: fork ? "explain.missedFork" : "explain.missedPiece", params: { move: bestMove, piece } });
    }
  }

  if (sentences.length === 0 || (sentences.length === 1 && move.classification === "miss")) {
    const structure = structureSentences(move);
    sentences.push(...(structure.length > 0 ? structure : [{ key: "explain.positional" }]));
  }
  return sentences.slice(0, MAX_SENTENCES);
}
