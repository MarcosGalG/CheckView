// Client for the chess.com Published-Data API: https://www.chess.com/news/view/published-data-api

const API_BASE = "https://api.chess.com/pub/player";

const DRAW_RESULTS = new Set([
  "agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient",
]);

async function getJson(url) {
  const response = await fetch(url);
  if (response.status === 404) {
    throw new Error("User not found on chess.com");
  }
  if (!response.ok) {
    throw new Error(`chess.com API error (${response.status})`);
  }
  return response.json();
}

/**
 * Returns the user's `limit` most recent games, newest first.
 * The API groups games into monthly archives, so they are walked backwards from the latest month.
 */
export async function getRecentGames(username, limit = 10) {
  const user = username.trim().toLowerCase();
  const { archives } = await getJson(`${API_BASE}/${user}/games/archives`);

  const games = [];
  for (let i = archives.length - 1; i >= 0 && games.length < limit; i--) {
    const month = await getJson(archives[i]);
    const standard = month.games.filter((g) => g.rules === "chess").reverse();
    games.push(...standard);
  }

  return games.slice(0, limit).map((game) => toGameSummary(game, user));
}

function toGameSummary(game, user) {
  const isWhite = game.white.username.toLowerCase() === user;
  const me = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;

  let outcome = "loss";
  if (me.result === "win") outcome = "win";
  else if (DRAW_RESULTS.has(me.result)) outcome = "draw";

  return {
    id: game.uuid,
    url: game.url,
    pgn: game.pgn,
    timeClass: game.time_class,
    endTime: new Date(game.end_time * 1000),
    color: isWhite ? "white" : "black",
    outcome,
    me: { username: me.username, rating: me.rating },
    opponent: { username: opponent.username, rating: opponent.rating },
  };
}
