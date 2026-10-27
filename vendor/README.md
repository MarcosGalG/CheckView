# Third-party code

| Library | Version | Files | License | Source |
|---|---|---|---|---|
| Stockfish.js (lite, single-threaded) | 19.0.1 | `stockfish/stockfish.js`, `stockfish/stockfish.wasm` | GPL-3.0 ([COPYING.txt](stockfish/COPYING.txt)) | [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) |
| chess.js | 1.4.0 | `chess.js/chess.js` (ESM build) | BSD-2-Clause ([LICENSE](chess.js/LICENSE)) | [jhlywa/chess.js](https://github.com/jhlywa/chess.js) |

Files are copied unmodified from the npm packages, except for renaming `stockfish-19-lite-single.{js,wasm}` to `stockfish.{js,wasm}`. The engine script loads the `.wasm` file with the same base name.
