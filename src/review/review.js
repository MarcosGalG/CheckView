import { Chessground } from "../../vendor/chessground/chessground.min.js";
import { Chess } from "../../vendor/chess.js/chess.js";
import { analyzeGame } from "../lib/analysis.js";
import { CLASSIFICATIONS, classifyMoves, summarize } from "../lib/classification.js";
import { Engine } from "../lib/engine.js";
import { explainMove } from "../lib/explanations.js";
import { applyTranslations, resolveLanguage, setLanguage, t } from "../lib/i18n.js";
import { loadOpenings, positionKey } from "../lib/openings.js";
import { EvalBar, formatEval } from "./eval-bar.js";
import { EvalGraph } from "./eval-graph.js";

// Every move that wasn't the engine's choice shows the move it preferred.
const SHOW_BEST_FOR = new Set(["excellent", "good", "inaccuracy", "mistake", "miss", "blunder"]);

// One single-threaded engine per core, leaving two cores free for the browser, capped at four.
const ENGINE_COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 2));

// Depth for positions explored on the board, where the answer must come back quickly.
const LIVE_DEPTH = 16;

const WORKER_URL = chrome.runtime.getURL("vendor/stockfish/stockfish.js");

const $ = (id) => document.getElementById(id);
const progress = $("progress");
const statusText = $("status");
const movesBody = $("moves-body");
const cellTemplate = $("move-cell");

/** Main line before analysis: one entry per ply, from chess.js. */
let mainLine = [];
/** Analyzed and classified moves, aligned with mainLine (null until the analysis ends). */
let analyzed = null;
/** Current position: a ply of the main line, or a variation branching off it. */
let cursor = { ply: 0, variation: null };
let iconMarkup = {};
/** Opening book (position key → name), loaded with the analysis. */
let openings = null;
let board;
let evalBar;
let graph;

// ---------------------------------------------------------------------------
// Icons and move text

// Chess symbols in place of the piece letter, as in printed notation. The solid set reads
// better than the outline one at text size and takes the move's color.
const FIGURINES = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞" };

/** SAN as figurine notation: "Qxd5" → [♕ span] "xd5". Pawn moves and castling stay as text. */
function sanNodes(san) {
  const figurine = FIGURINES[san[0]];
  if (!figurine) return [san];
  const piece = document.createElement("span");
  piece.className = "figurine";
  piece.textContent = figurine;
  return [piece, san.slice(1)];
}

function classificationIcon(classification) {
  const icon = document.createElement("img");
  icon.className = "class-icon";
  icon.src = new URL(`icons/${classification}.svg`, import.meta.url).href;
  icon.alt = t(`class.${classification}`);
  icon.title = icon.alt;
  return icon;
}

/** Inner markup of every icon, to draw them on board squares as chessground custom SVGs. */
async function loadIconMarkup() {
  const entries = await Promise.all(CLASSIFICATIONS.map(async (name) => {
    const text = await (await fetch(new URL(`icons/${name}.svg`, import.meta.url))).text();
    return [name, text.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")];
  }));
  iconMarkup = Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// Positions

/** Everything needed to show the current cursor: FEN, last move, evaluation and annotations. */
function currentPosition() {
  if (cursor.variation) {
    const { moves, index } = cursor.variation;
    const move = moves[index - 1];
    return { fen: move.after, lastMove: [move.from, move.to], move: null, evaluation: move.evaluation ?? null };
  }
  if (cursor.ply === 0) {
    const fen = mainLine[0]?.before ?? new Chess().fen();
    return { fen, lastMove: undefined, move: null, evaluation: analyzed?.[0]?.evalBefore ?? null };
  }
  const move = analyzed?.[cursor.ply - 1] ?? null;
  const raw = mainLine[cursor.ply - 1];
  return { fen: raw.after, lastMove: [raw.from, raw.to], move, evaluation: move?.evalAfter ?? null };
}

function legalDests(chess) {
  const dests = new Map();
  for (const move of chess.moves({ verbose: true })) {
    if (!dests.has(move.from)) dests.set(move.from, []);
    dests.get(move.from).push(move.to);
  }
  return dests;
}

function boardShapes(position, liveBest) {
  const shapes = [];
  const { move } = position;
  if (move && iconMarkup[move.classification]) {
    shapes.push({
      orig: move.to,
      customSvg: { html: `<svg x="64" y="-14" width="48" height="48" viewBox="0 0 24 24">${iconMarkup[move.classification]}</svg>` },
    });
    if (SHOW_BEST_FOR.has(move.classification) && move.bestMove) {
      shapes.push({ orig: move.bestMove.slice(0, 2), dest: move.bestMove.slice(2, 4), brush: "green" });
    }
  }
  if (liveBest) shapes.push({ orig: liveBest.slice(0, 2), dest: liveBest.slice(2, 4), brush: "blue" });
  return shapes;
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  const position = currentPosition();
  const chess = new Chess(position.fen);
  const turn = chess.turn() === "w" ? "white" : "black";

  // The squares of a classified move take the color of its classification.
  const classification = position.move?.classification;
  const tinted = classification && position.lastMove
    ? new Map(position.lastMove.map((square) => [square, `cls-${classification}`]))
    : new Map();

  board.set({
    fen: position.fen,
    lastMove: position.lastMove,
    highlight: { lastMove: true, check: true, custom: tinted },
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    movable: { color: turn, dests: legalDests(chess) },
  });
  board.setAutoShapes(boardShapes(position, cursor.variation ? liveResult(position.fen)?.bestMove : null));

  const evaluation = position.evaluation ?? liveResult(position.fen);
  if (evaluation) evalBar.update(evaluation);
  else requestLive(position.fen);

  renderCurrent(position, evaluation);
  renderActiveMove();
  graph.setCursor(cursor.variation ? cursor.variation.base : cursor.ply);
}

/** A move line as nodes: "12... ♞xe4 13. ♛d3". */
function lineNodes(line) {
  return line.flatMap((step, i) => {
    const number = step.color === "w" ? `${step.number}. ` : i === 0 ? `${step.number}... ` : "";
    return [i > 0 ? " " : "", number, ...sanNodes(step.san)];
  });
}

/** Translated sentence with its placeholders rendered: moves and lines as figurine notation. */
function sentenceNodes(key, params = {}) {
  return t(key).split(/(\{\w+\})/).flatMap((part) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (!name || !(name in params)) return [part];
    const value = params[name];
    if (name === "move") return sanNodes(value.san);
    if (name === "line") return lineNodes(value);
    if (name === "piece") return [t(`pieceA.${value}`)];
    return [String(value)];
  });
}

/** Name of the opening reached at `ply`: the deepest named book position up to it. */
function openingName(ply) {
  for (let i = ply; i >= 1; i--) {
    const name = openings?.[positionKey(mainLine[i - 1].after)];
    if (name) return name;
  }
  return null;
}

function moveExplanation(move) {
  if (move.classification !== "book") return move.explanation;
  const opening = openingName(move.ply);
  return [opening ? { key: "explain.book", params: { opening } } : { key: "explain.bookUnnamed" }];
}

function renderCurrent(position, evaluation) {
  const panel = $("current");
  const icon = $("current-icon");
  const text = $("current-text");
  const explanation = $("current-explanation");
  const best = $("current-best");
  icon.replaceChildren();
  explanation.replaceChildren();
  best.replaceChildren();
  best.hidden = true;
  $("back-to-game").hidden = !cursor.variation;

  if (cursor.variation) {
    const played = cursor.variation.moves.slice(0, cursor.variation.index);
    text.replaceChildren(`${t("review.variation")}:`, ...played.flatMap((m) => [" ", ...sanNodes(m.san)]));
  } else if (position.move) {
    const { classification, san, bestMoveSan } = position.move;
    icon.append(classificationIcon(classification));
    text.replaceChildren(...sanNodes(san), ` · ${t(`class.${classification}`)}`);
    for (const sentence of moveExplanation(position.move)) {
      if (explanation.childNodes.length > 0) explanation.append(" ");
      explanation.append(...sentenceNodes(sentence.key, sentence.params));
    }
    if (SHOW_BEST_FOR.has(classification) && bestMoveSan) {
      best.replaceChildren(classificationIcon("best"), ...sentenceNodes("review.best", { move: { san: bestMoveSan } }));
      best.hidden = false;
    }
  } else if (cursor.ply > 0) {
    text.replaceChildren(...sanNodes(mainLine[cursor.ply - 1].san));
  } else {
    panel.hidden = true;
    return;
  }
  $("current-eval").textContent = formatEval(evaluation);
  panel.hidden = false;
}

function renderMoveList() {
  const rows = new Map();
  mainLine.forEach((raw, i) => {
    const moveNumber = Math.floor(i / 2) + 1;
    const row = rows.get(moveNumber) ?? {};
    row[raw.color] = i + 1;
    rows.set(moveNumber, row);
  });

  movesBody.replaceChildren();
  for (const [moveNumber, { w, b }] of rows) {
    const row = document.createElement("tr");
    const number = document.createElement("td");
    number.className = "move-number";
    number.textContent = `${moveNumber}.`;
    row.append(number, moveCell(w), moveCell(b));
    movesBody.append(row);
  }
}

function moveCell(ply) {
  const td = document.createElement("td");
  if (!ply) return td;
  const cell = cellTemplate.content.cloneNode(true);
  const button = cell.querySelector(".move");
  button.dataset.ply = ply;
  button.addEventListener("click", () => goTo(ply));
  const classification = analyzed?.[ply - 1]?.classification;
  if (classification) {
    cell.querySelector(".move-icon").replaceWith(classificationIcon(classification));
    button.classList.add(`cls-${classification}`);
  }
  cell.querySelector(".move-san").replaceChildren(...sanNodes(mainLine[ply - 1].san));
  td.append(cell);
  return td;
}

function renderActiveMove() {
  const activePly = cursor.variation ? cursor.variation.base : cursor.ply;
  if (activePly === 0) $("panel-scroll").scrollTop = 0;
  for (const button of movesBody.querySelectorAll(".move")) {
    const active = Number(button.dataset.ply) === activePly;
    button.classList.toggle("active", active);
    if (active) button.scrollIntoView({ block: "nearest" });
  }
}

function renderSummary(summary, white, black) {
  $("white-name").textContent = white.username;
  $("black-name").textContent = black.username;
  $("white-accuracy").textContent = summary.w.accuracy?.toFixed(1) ?? "–";
  $("black-accuracy").textContent = summary.b.accuracy?.toFixed(1) ?? "–";

  const counts = $("summary-counts");
  counts.replaceChildren();
  for (const classification of CLASSIFICATIONS) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.textContent = t(`class.${classification}`);

    // The icon sits between both counts so each number is clearly tied to its category.
    const icon = document.createElement("td");
    icon.className = "summary-icon";
    icon.append(classificationIcon(classification));

    const whiteCount = document.createElement("td");
    whiteCount.textContent = summary.w.counts[classification];
    const blackCount = document.createElement("td");
    blackCount.textContent = summary.b.counts[classification];

    row.append(label, whiteCount, icon, blackCount);
    counts.append(row);
  }
  $("summary").hidden = false;
}

function renderPlayers(game, white, black) {
  $("players").textContent = `${white.username} (${white.rating}) vs ${black.username} (${black.rating})`;
  const [top, bottom] = game.color === "white" ? [black, white] : [white, black];
  for (const [element, player] of [[$("player-top"), top], [$("player-bottom"), bottom]]) {
    const rating = document.createElement("span");
    rating.className = "rating";
    rating.textContent = `(${player.rating})`;
    element.replaceChildren(player.username, rating);
  }
}

// ---------------------------------------------------------------------------
// Navigation

function goTo(ply) {
  cursor = { ply: Math.max(0, Math.min(mainLine.length, ply)), variation: null };
  render();
}

function step(delta) {
  const { variation } = cursor;
  if (!variation) return goTo(cursor.ply + delta);

  const index = variation.index + delta;
  if (index < 1) return goTo(variation.base);
  variation.index = Math.min(index, variation.moves.length);
  render();
}

/** A move played on the board: follows the game if it matches, otherwise starts or extends a variation. */
function onBoardMove(from, to) {
  const position = currentPosition();
  const chess = new Chess(position.fen);
  const played = chess.move({ from, to, promotion: "q" });
  const move = { san: played.san, from, to, after: played.after };

  if (!cursor.variation) {
    const next = mainLine[cursor.ply];
    if (next && next.from === from && next.to === to) return goTo(cursor.ply + 1);
    cursor = { ply: cursor.ply, variation: { base: cursor.ply, moves: [move], index: 1 } };
  } else {
    const { variation } = cursor;
    variation.moves = [...variation.moves.slice(0, variation.index), move];
    variation.index = variation.moves.length;
  }
  render();
}

/** Plays the engine's choice instead of the current move, as a variation from the position before it. */
function playBestMove() {
  const move = analyzed?.[cursor.ply - 1];
  if (cursor.variation || !move?.bestMove) return;
  const chess = new Chess(move.fenBefore);
  const best = move.bestMove;
  const played = chess.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
  const variationMove = { san: played.san, from: played.from, to: played.to, after: played.after };
  cursor = { ply: cursor.ply - 1, variation: { base: cursor.ply - 1, moves: [variationMove], index: 1 } };
  render();
}

function bindNavigation() {
  $("nav-first").addEventListener("click", () => goTo(0));
  $("nav-prev").addEventListener("click", () => step(-1));
  $("nav-next").addEventListener("click", () => step(1));
  $("nav-last").addEventListener("click", () => goTo(mainLine.length));
  $("back-to-game").addEventListener("click", () => goTo(cursor.variation.base));
  $("current-best").addEventListener("click", playBestMove);
  document.addEventListener("keydown", (event) => {
    const actions = { ArrowLeft: () => step(-1), ArrowRight: () => step(1), Home: () => goTo(0), End: () => goTo(mainLine.length) };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
}

// ---------------------------------------------------------------------------
// Live engine for positions without a stored evaluation (book moves and variations)

let liveEngine = null;
let liveRunning = false;
let liveTarget = null;
const liveCache = new Map();

function liveResult(fen) {
  return liveCache.get(fen) ?? null;
}

function requestLive(fen) {
  liveTarget = fen;
  if (liveRunning) liveEngine?.stop();
  else runLive();
}

async function runLive() {
  liveRunning = true;
  try {
    if (!liveEngine) {
      liveEngine = new Engine(WORKER_URL);
      await liveEngine.init();
    }
    while (liveTarget) {
      const fen = liveTarget;
      liveTarget = null;
      const result = await liveEngine.evaluate(fen, { depth: LIVE_DEPTH });
      // A stopped search is incomplete: only keep results that ran to the end.
      if (liveTarget === null) {
        liveCache.set(fen, result);
        if (currentPosition().fen === fen) render();
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    liveRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Startup

function showError(key) {
  progress.hidden = true;
  statusText.textContent = t(key);
  statusText.classList.add("error");
  statusText.hidden = false;
}

function updateProgress(done, total) {
  $("progress-bar").style.width = `${(done / total) * 100}%`;
  $("progress-text").textContent = t("review.analyzing", { done, total });
}

async function analyze(game, white, black) {
  const engines = Array.from({ length: ENGINE_COUNT }, () => new Engine(WORKER_URL));
  progress.hidden = false;
  updateProgress(0, 1);
  try {
    [openings] = await Promise.all([
      loadOpenings(chrome.runtime.getURL("data/openings.json")),
      ...engines.map((engine) => engine.init()),
    ]);
    const analysis = await analyzeGame(game.pgn, engines, { openings, onProgress: updateProgress });
    analyzed = classifyMoves(analysis.moves).map((move) => ({ ...move, explanation: explainMove(move) }));
    progress.hidden = true;
    renderSummary(summarize(analyzed), white, black);
    graph.setMoves(analyzed);
    $("graph-wrap").hidden = false;
    renderMoveList();
    render();
  } catch (error) {
    console.error(error);
    showError("review.failed");
  } finally {
    for (const engine of engines) engine.terminate();
  }
}

const { language } = await chrome.storage.local.get("language");
setLanguage(resolveLanguage(language));
applyTranslations();

const { currentGame: game } = await chrome.storage.session.get("currentGame");
if (!game) {
  showError("review.noGame");
} else {
  const [white, black] = game.color === "white" ? [game.me, game.opponent] : [game.opponent, game.me];
  const parsed = new Chess();
  parsed.loadPgn(game.pgn);
  mainLine = parsed.history({ verbose: true });

  await loadIconMarkup();
  board = Chessground($("board"), {
    orientation: game.color,
    coordinates: true,
    movable: { free: false, showDests: true, events: { after: onBoardMove } },
    draggable: { showGhost: true },
    drawable: { enabled: true, visible: true },
    animation: { duration: 150 },
  });
  evalBar = new EvalBar($("eval-bar"));
  evalBar.setOrientation(game.color);
  graph = new EvalGraph($("graph"), $("graph-tooltip"), goTo);

  renderPlayers(game, white, black);
  renderMoveList();
  bindNavigation();
  render();
  analyze(game, white, black);
}
