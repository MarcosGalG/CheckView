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

Performance:

- **Engine pool.** One single-threaded engine per available core (leaving two free, capped at four) analyzes different positions in parallel.
- **Book moves are skipped.** Only the last book position is evaluated, as the starting point of the first move out of book.
- **Second line on demand.** When the played move matches the engine's choice, the position is searched again with MultiPV 2 to get `secondBestEval`, used to detect only moves. The transposition table, still warm from the first search, makes this cheap.
- **Deterministic results.** The transposition table is cleared (`ucinewgame`) before each new position, so a position always gets the same evaluation regardless of which engine in the pool analyzes it.

A 70-move game takes around 20 seconds with four engines.

### Classification and accuracy (`src/lib/classification.js`)

Scores are converted to winning chances with the Lichess logistic model, `win% = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)`, clamped to ±1000 cp. For every move, `winLoss` is the drop in the mover's winning chances between `evalBefore` and `evalAfter` (zero when the engine's move was played).

Rules, applied in order:

| Classification | Rule |
|---|---|
| Book | Every position so far is in the opening book (`data/openings.json`) |
| Best | The engine's top move |
| Excellent / Good / Inaccuracy / Mistake / Blunder | `winLoss` ≤ 2 / ≤ 5 / ≤ 10 / ≤ 20 / > 20 |
| Miss | A mistake or blunder right after the opponent's mistake or blunder, without ending up worse than before it |
| Great | Best move whose second-best alternative is ≥ 15 points worse, excluding plain recaptures |
| Brilliant | Best, great or excellent move that leaves a piece en prise (undefended, or attacked by a cheaper piece), keeps ≥ 50% winning chances and wasn't already completely winning |

Move accuracy uses the Lichess formula `103.1668 · e^(−0.04354 · winLoss) − 3.1669`; game accuracy is the mean over a player's non-book moves.

Classification icons live in `src/review/icons/` as standalone SVG files.

### Opening book (`data/openings.json`)

Generated by `scripts/build-openings.mjs` from the [Lichess chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0). It maps every position reached in a named opening line to its name. Positions are compared by board, side to move, castling rights and en passant square, ignoring move counters.

## Internationalization

Chrome's `chrome.i18n` API follows the browser locale and cannot be switched at runtime, so translations live in `src/lib/i18n.js`:

- Static text is marked in the HTML with `data-i18n` or `data-i18n-placeholder` and filled by `applyTranslations()`.
- Dynamic text uses `t(key, params)`, with `{name}` placeholders.
- User-facing messages are kept short and non-technical; HTTP and network failures share a single generic message.
- Language resolution: saved preference → browser language → English.
- The API client throws `ChessComApiError` with a stable `code` instead of a user-facing message, keeping the data layer independent of the UI language.

## Security

API data is written to the DOM with `textContent`, never `innerHTML`, to prevent HTML injection.
