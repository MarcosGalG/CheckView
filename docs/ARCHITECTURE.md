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

## Internationalization

Chrome's `chrome.i18n` API follows the browser locale and cannot be switched at runtime, so translations live in `src/lib/i18n.js`:

- Static text is marked in the HTML with `data-i18n`, `data-i18n-placeholder` or `data-i18n-title` and filled by `applyTranslations()`.
- Dynamic text uses `t(key, params)`, with `{name}` placeholders.
- Language resolution: saved preference → browser language → English.
- The API client throws `ChessComApiError` with a stable `code` instead of a user-facing message, keeping the data layer independent of the UI language.

## Security

API data is written to the DOM with `textContent`, never `innerHTML`, to prevent HTML injection.
