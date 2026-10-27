# CheckView

A Chrome extension that analyzes your finished [chess.com](https://www.chess.com) games move by move: a summary with move-quality counts (brilliant, best, mistakes…), accuracy for each player, and explanations of what went wrong.

Everything is **free and local**: games are fetched from the chess.com public API and analyzed by [Stockfish](https://stockfishchess.org/) running inside the browser. No servers, no paid APIs.

> Personal project, not affiliated with chess.com. Only **finished** games are analyzed, so it cannot be used during a live game.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Extension skeleton, configurable username, recent games list, English/Spanish UI | ✅ |
| 2 | Stockfish (WebAssembly) engine integration and per-move evaluation | ⏳ |
| 3 | Move classification, accuracy and game summary | ⏳ |
| 4 | Move-by-move review with board and evaluation graph | ⏳ |
| 5 | Mistake explanations (hanging pieces, mates, tactics, positional errors) | ⏳ |

## Installation (developer mode)

1. Clone the repository:
   ```bash
   git clone https://github.com/MarcosGalG/CheckView.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension, open it and enter your chess.com username.

The interface is available in English and Spanish. It follows the browser language by default and can be changed from the selector in the popup.

## Project structure

```
CheckView/
├── manifest.json            # Extension configuration (Manifest V3)
├── src/
│   ├── lib/
│   │   ├── chesscom-api.js  # chess.com public API client
│   │   └── i18n.js          # English/Spanish translations
│   └── popup/               # Toolbar popup
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
└── docs/
    └── ARCHITECTURE.md      # Technical design
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Tech stack

- Vanilla JavaScript (ES modules), HTML and CSS. No frameworks, no build step.
- Chrome Extensions, Manifest V3.
- [chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
- Stockfish compiled to WebAssembly (from phase 2).

## License

[GPL-3.0](LICENSE). Stockfish is distributed under GPLv3, so this project uses the same license.
