import { ChessComApiError, getRecentGames } from "../lib/chesscom-api.js";
import { applyTranslations, getLanguage, resolveLanguage, setLanguage, t } from "../lib/i18n.js";

const form = document.getElementById("user-form");
const usernameInput = document.getElementById("username");
const languageSelect = document.getElementById("language");
const statusText = document.getElementById("status");
const gameList = document.getElementById("game-list");
const rowTemplate = document.getElementById("game-row");

// Kept so the current view can be re-rendered when the language changes.
let currentGames = [];
let currentStatus = null;

function showStatus(key, { params, isError = false } = {}) {
  currentStatus = { key, params, isError };
  statusText.textContent = t(key, params);
  statusText.classList.toggle("error", isError);
  statusText.hidden = false;
}

function hideStatus() {
  currentStatus = null;
  statusText.hidden = true;
}

function renderGames(games) {
  currentGames = games;
  gameList.replaceChildren();

  for (const game of games) {
    const row = rowTemplate.content.cloneNode(true);
    applyTranslations(row);

    const result = row.querySelector(".game-result");
    result.textContent = t(`outcome.${game.outcome}`);
    result.classList.add(game.outcome);

    row.querySelector(".game-opponent").textContent =
      `vs ${game.opponent.username} (${game.opponent.rating})`;

    const date = game.endTime.toLocaleDateString(getLanguage());
    row.querySelector(".game-meta").textContent =
      `${t(`timeClass.${game.timeClass}`)} · ${t(`color.${game.color}`)} · ${date}`;

    row.querySelector(".game-analyze").addEventListener("click", () => openReview(game));

    gameList.append(row);
  }
}

async function openReview(game) {
  const { pgn, color, outcome, url, me, opponent } = game;
  await chrome.storage.session.set({ currentGame: { pgn, color, outcome, url, me, opponent } });
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/review/review.html") });
}

async function loadGames(username) {
  renderGames([]);
  showStatus("loading");
  try {
    const games = await getRecentGames(username);
    if (games.length === 0) {
      showStatus("noGames");
      return;
    }
    hideStatus();
    renderGames(games);
  } catch (error) {
    const notFound = error instanceof ChessComApiError && error.code === "userNotFound";
    showStatus(notFound ? "errors.userNotFound" : "errors.loadFailed", { isError: true });
  }
}

function changeLanguage(language) {
  setLanguage(language);
  languageSelect.value = getLanguage();
  applyTranslations();
  renderGames(currentGames);
  if (currentStatus) showStatus(currentStatus.key, currentStatus);
}

languageSelect.addEventListener("change", async () => {
  changeLanguage(languageSelect.value);
  await chrome.storage.local.set({ language: getLanguage() });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;
  await chrome.storage.local.set({ username });
  loadGames(username);
});

const settings = await chrome.storage.local.get(["username", "language"]);
changeLanguage(resolveLanguage(settings.language));
if (settings.username) {
  usernameInput.value = settings.username;
  loadGames(settings.username);
}
