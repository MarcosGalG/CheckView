# Architecture

## Overview

CheckView is a Chrome extension (Manifest V3) with no backend: data comes from the chess.com public API and all processing happens in the browser.

Permissions declared in `manifest.json`:

- `storage`: persists user settings.
- `host_permissions: https://api.chess.com/*`: the only network origin the extension can reach.

## Fetching games

```
popup.js ──getRecentGames()──▶ chesscom-api.js ──HTTP GET──▶ api.chess.com
   ▲                                │
   └──────── GameSummary[] ◀────────┘
```

`popup.js` only handles the UI; all knowledge about the API is isolated in `src/lib/chesscom-api.js`.

The API has no "latest games" endpoint. Instead, games are grouped into monthly archives:

1. `GET /pub/player/{username}/games/archives` → URLs of every month with games.
2. `GET /pub/player/{username}/games/{YYYY}/{MM}` → that month's games in chronological order.

`getRecentGames()` walks the archives from the most recent month until it has enough games, skipping variants (`rules !== "chess"`). The API only exposes finished games, which guarantees analysis never runs on a game in progress.

Each game is normalized into a `GameSummary` from the user's perspective:

| Field | Description |
|---|---|
| `id`, `url` | Game identifier and chess.com link |
| `pgn` | Full game in PGN format |
| `timeClass` | `bullet`, `blitz`, `rapid` or `daily` |
| `endTime` | End date |
| `color` | The user's color |
| `outcome` | `win`, `loss` or `draw` |
| `me`, `opponent` | Username and rating of each player |

## Game analysis

Clicking **Analyze** stores the selected game in `chrome.storage.session` and opens `src/review/review.html` in a new tab. The analysis runs there rather than in the popup, because the popup is destroyed as soon as it loses focus.

```
review.js ──analyzeGame(pgn)──▶ analysis.js ──evaluate(fen)──▶ engine.js ──UCI──▶ Stockfish (Web Worker + WASM)
```

### Engine (`src/lib/engine.js`)

Stockfish runs in a Web Worker so the search never blocks the UI. Communication uses the UCI text protocol:

1. `uci` → `uciok`, `isready` → `readyok` on startup.
2. For each position: `position fen <fen>` and `go depth <n>`.
3. The engine streams `info … score cp|mate … pv …` lines and ends with `bestmove <move>`.

`evaluate()` keeps the last exact `info` score (bounds are ignored) and returns it **from White's point of view**, since UCI scores are relative to the side to move. Mates are mapped to a large centipawn sentinel so every evaluation is comparable numerically. Requests are queued because the engine handles one search at a time.

The lite single-threaded build (~1.8 MB) is used: it needs no cross-origin isolation and is far stronger than any human. Running WebAssembly in extension pages requires `'wasm-unsafe-eval'` in the manifest's content security policy.

### Per-move evaluation (`src/lib/analysis.js`)

chess.js parses the PGN and yields every position. Each position is evaluated once at depth 14; move *i* then gets:

| Field | Description |
|---|---|
| `evalBefore` | Evaluation of the position before the move (best play) |
| `evalAfter` | Evaluation after the move actually played |
| `bestMove`, `bestMoveSan` | Engine's preferred move (UCI and SAN) |
| `isBest` | Whether the played move matches the engine's choice |

The difference between `evalBefore` and `evalAfter` is the basis for move classification in phase 3. A typical 40-move game takes around 15–30 seconds.

## Internationalization

Chrome's `chrome.i18n` API follows the browser locale and cannot be switched at runtime, so translations live in `src/lib/i18n.js`:

- Static text is marked in the HTML with `data-i18n` or `data-i18n-placeholder` and filled by `applyTranslations()`.
- Dynamic text uses `t(key, params)`, with `{name}` placeholders.
- User-facing messages are kept short and non-technical; HTTP and network failures share a single generic message.
- Language resolution: saved preference → browser language → English.
- The API client throws `ChessComApiError` with a stable `code` instead of a user-facing message, keeping the data layer independent of the UI language.

## Security

API data is written to the DOM with `textContent`, never `innerHTML`, to prevent HTML injection.
