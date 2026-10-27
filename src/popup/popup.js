import { getRecentGames } from "../lib/chesscom-api.js";

const form = document.getElementById("user-form");
const usernameInput = document.getElementById("username");
const statusText = document.getElementById("status");
const gameList = document.getElementById("game-list");
const rowTemplate = document.getElementById("game-row");

const RESULT_LETTER = { win: "W", loss: "L", draw: "D" };
const TIME_CLASS_LABEL = { bullet: "Bullet", blitz: "Blitz", rapid: "Rapid", daily: "Daily" };

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
  statusText.hidden = false;
}

function renderGames(games) {
  gameList.replaceChildren();

  for (const game of games) {
    const row = rowTemplate.content.cloneNode(true);

    const result = row.querySelector(".game-result");
    result.textContent = RESULT_LETTER[game.outcome];
    result.classList.add(game.outcome);

    row.querySelector(".game-opponent").textContent =
      `vs ${game.opponent.username} (${game.opponent.rating})`;

    const colorLabel = game.color === "white" ? "White" : "Black";
    const date = game.endTime.toLocaleDateString();
    row.querySelector(".game-meta").textContent =
      `${TIME_CLASS_LABEL[game.timeClass] ?? game.timeClass} · ${colorLabel} · ${date}`;

    gameList.append(row);
  }
}

async function loadGames(username) {
  showStatus("Loading games…");
  gameList.replaceChildren();
  try {
    const games = await getRecentGames(username);
    if (games.length === 0) {
      showStatus("No games found for this user.");
      return;
    }
    statusText.hidden = true;
    renderGames(games);
  } catch (error) {
    showStatus(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  await chrome.storage.local.set({ username });
  loadGames(username);
});

const { username } = await chrome.storage.local.get("username");
if (username) {
  usernameInput.value = username;
  loadGames(username);
}
