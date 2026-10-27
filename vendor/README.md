# Third-party code

| Library | Version | Files | License | Source |
|---|---|---|---|---|
| Stockfish.js (lite, single-threaded) | 19.0.1 | `stockfish/stockfish.js`, `stockfish/stockfish.wasm` | GPL-3.0 ([COPYING.txt](stockfish/COPYING.txt)) | [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) |
| chess.js | 1.4.0 | `chess.js/chess.js` (ESM build) | BSD-2-Clause ([LICENSE](chess.js/LICENSE)) | [jhlywa/chess.js](https://github.com/jhlywa/chess.js) |
| Chessground | 9.2.1 | `chessground/chessground.min.js`, `chessground.base.css` | GPL-3.0-or-later | [lichess-org/chessground](https://github.com/lichess-org/chessground) |
| cburnett piece set | (bundled with Chessground 9.2.1) | `chessground/chessground.cburnett.css` | GPL-2.0-or-later, by Colin M.L. Burnett | [lichess-org/chessground](https://github.com/lichess-org/chessground) |

Files are copied unmodified from the npm packages, except for renaming `stockfish-19-lite-single.{js,wasm}` to `stockfish.{js,wasm}`. The engine script loads the `.wasm` file with the same base name.
