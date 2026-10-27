import { analyzeGame } from "../lib/analysis.js";
import { CLASSIFICATIONS, classifyMoves, summarize } from "../lib/classification.js";
import { Engine } from "../lib/engine.js";
import { applyTranslations, resolveLanguage, setLanguage, t } from "../lib/i18n.js";
import { loadOpenings } from "../lib/openings.js";

// Moves at or below this quality show the engine's preferred move.
const SHOW_BEST_FOR = new Set(["inaccuracy", "mistake", "miss", "blunder"]);

// One single-threaded engine per core, leaving two cores free for the browser, capped at four.
const ENGINE_COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 2));

const playersText = document.getElementById("players");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const statusText = document.getElementById("status");
const summaryTable = document.getElementById("summary");
const summaryCounts = document.getElementById("summary-counts");
const movesTable = document.getElementById("moves");
const movesBody = document.getElementById("moves-body");
const cellTemplate = document.getElementById("move-cell");

function formatEval(evaluation) {
  if (!evaluation) return "";
  const { cp, mate } = evaluation;
  if (mate === 0) return cp > 0 ? "1-0" : "0-1";
  if (mate !== null) return mate > 0 ? `M${mate}` : `-M${-mate}`;
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function showError(key) {
  progress.hidden = true;
  statusText.textContent = t(key);
  statusText.classList.add("error");
  statusText.hidden = false;
}

function updateProgress(done, total) {
  progressBar.style.width = `${(done / total) * 100}%`;
  progressText.textContent = t("review.analyzing", { done, total });
}

function classificationIcon(classification) {
  const icon = document.createElement("img");
  icon.className = "class-icon";
  icon.src = new URL(`icons/${classification}.svg`, import.meta.url).href;
  icon.alt = t(`class.${classification}`);
  icon.title = icon.alt;
  return icon;
}

function renderSummary(summary, white, black) {
  document.getElementById("white-name").textContent = white.username;
  document.getElementById("black-name").textContent = black.username;
  document.getElementById("white-accuracy").textContent = summary.w.accuracy?.toFixed(1) ?? "–";
  document.getElementById("black-accuracy").textContent = summary.b.accuracy?.toFixed(1) ?? "–";

  summaryCounts.replaceChildren();
  for (const classification of CLASSIFICATIONS) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    const content = document.createElement("div");
    content.className = "class-label";
    const name = document.createElement("span");
    name.textContent = t(`class.${classification}`);
    content.append(classificationIcon(classification), name);
    label.append(content);

    const whiteCount = document.createElement("td");
    whiteCount.textContent = summary.w.counts[classification];
    const blackCount = document.createElement("td");
    blackCount.textContent = summary.b.counts[classification];

    row.append(label, whiteCount, blackCount);
    summaryCounts.append(row);
  }
  summaryTable.hidden = false;
}

function renderMoveCell(move) {
  const td = document.createElement("td");
  if (!move) return td;
  const cell = cellTemplate.content.cloneNode(true);
  cell.querySelector(".move-icon").replaceWith(classificationIcon(move.classification));
  cell.querySelector(".move-san").textContent = move.san;
  cell.querySelector(".move-eval").textContent = move.isBook ? "" : formatEval(move.evalAfter);
  if (SHOW_BEST_FOR.has(move.classification) && move.bestMoveSan) {
    cell.querySelector(".move-best").textContent = t("review.best", { move: move.bestMoveSan });
  }
  td.append(cell);
  return td;
}

function renderMoves(moves) {
  const rows = new Map();
  for (const move of moves) {
    const row = rows.get(move.moveNumber) ?? {};
    row[move.color] = move;
    rows.set(move.moveNumber, row);
  }

  movesBody.replaceChildren();
  for (const [moveNumber, { w, b }] of rows) {
    const row = document.createElement("tr");
    const number = document.createElement("td");
    number.className = "move-number";
    number.textContent = `${moveNumber}.`;
    row.append(number, renderMoveCell(w), renderMoveCell(b));
    movesBody.append(row);
  }
  movesTable.hidden = false;
}

const { language } = await chrome.storage.local.get("language");
setLanguage(resolveLanguage(language));
applyTranslations();

const { currentGame: game } = await chrome.storage.session.get("currentGame");
if (!game) {
  showError("review.noGame");
} else {
  const [white, black] = game.color === "white" ? [game.me, game.opponent] : [game.opponent, game.me];
  playersText.textContent = `${white.username} (${white.rating}) vs ${black.username} (${black.rating})`;

  const workerUrl = chrome.runtime.getURL("vendor/stockfish/stockfish.js");
  const engines = Array.from({ length: ENGINE_COUNT }, () => new Engine(workerUrl));
  progress.hidden = false;
  updateProgress(0, 1);
  try {
    const [openings] = await Promise.all([
      loadOpenings(chrome.runtime.getURL("data/openings.json")),
      ...engines.map((engine) => engine.init()),
    ]);
    const analysis = await analyzeGame(game.pgn, engines, { openings, onProgress: updateProgress });
    const moves = classifyMoves(analysis.moves);
    progress.hidden = true;
    renderSummary(summarize(moves), white, black);
    renderMoves(moves);
  } catch (error) {
    console.error(error);
    showError("review.failed");
  } finally {
    for (const engine of engines) engine.terminate();
  }
}
