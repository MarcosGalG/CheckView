// Client for the chess.com Published-Data API: https://www.chess.com/news/view/published-data-api

const API_BASE = "https://api.chess.com/pub/player";

const DRAW_RESULTS = new Set([
  "agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient",
]);

/** Error with a stable `code` ("userNotFound" | "requestFailed") so the UI can translate it. */
export class ChessComApiError extends Error {
  constructor(code, status) {
    super(`chess.com API: ${code} (${status})`);
    this.name = "ChessComApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Fetches JSON from the API. A 404 only means "user not found" on the player's own endpoint:
 * the API also answers 404 on internal errors, e.g. while serving a monthly archive.
 */
async function getJson(url, { notFoundMeansNoUser = false } = {}) {
  const response = await fetch(url);
  if (response.status === 404 && notFoundMeansNoUser) {
    throw new ChessComApiError("userNotFound", response.status);
  }
  if (!response.ok) {
    throw new ChessComApiError("requestFailed", response.status);
  }
  return response.json();
}

/**
 * Returns the user's `limit` most recent games, newest first.
 * The API groups games into monthly archives, so they are walked backwards from the latest month.
 */
export async function getRecentGames(username, limit = 10) {
  const user = username.trim().toLowerCase();
  const { archives } = await getJson(`${API_BASE}/${user}/games/archives`, { notFoundMeansNoUser: true });

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
