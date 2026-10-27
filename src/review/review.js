import { analyzeGame } from "../lib/analysis.js";
import { Engine } from "../lib/engine.js";
import { applyTranslations, resolveLanguage, setLanguage, t } from "../lib/i18n.js";

const playersText = document.getElementById("players");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const statusText = document.getElementById("status");
const movesTable = document.getElementById("moves");
const movesBody = document.getElementById("moves-body");
const cellTemplate = document.getElementById("move-cell");

function formatEval({ cp, mate }) {
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

function renderMoveCell(move) {
  const td = document.createElement("td");
  if (!move) return td;
  const cell = cellTemplate.content.cloneNode(true);
  cell.querySelector(".move-san").textContent = move.san;
  cell.querySelector(".move-eval").textContent = formatEval(move.evalAfter);
  if (!move.isBest && move.bestMoveSan) {
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

  const engine = new Engine(chrome.runtime.getURL("vendor/stockfish/stockfish.js"));
  progress.hidden = false;
  updateProgress(0, 1);
  try {
    await engine.init();
    const analysis = await analyzeGame(game.pgn, engine, { onProgress: updateProgress });
    progress.hidden = true;
    renderMoves(analysis.moves);
  } catch (error) {
    console.error(error);
    showError("review.failed");
  } finally {
    engine.terminate();
  }
}
