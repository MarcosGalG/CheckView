// Builds data/openings.json from the Lichess chess-openings dataset (CC0):
// https://github.com/lichess-org/chess-openings
//
// Usage: node scripts/build-openings.mjs <a.tsv> <b.tsv> ... > data/openings.json
//
// Output maps the position key of every opening position (including intermediate ones)
// to the opening name, or "" when the position has no name of its own.

import { readFileSync } from "node:fs";
import { Chess } from "../vendor/chess.js/chess.js";
import { positionKey } from "../src/lib/openings.js";

const openings = {};

for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, "utf8").trim().split("\n").slice(1);
  for (const row of rows) {
    const [, name, pgn] = row.split("\t");
    const game = new Chess();
    game.loadPgn(pgn);
    const replay = new Chess();
    for (const move of game.history()) {
      replay.move(move);
      const key = positionKey(replay.fen());
      openings[key] ??= "";
    }
    openings[positionKey(replay.fen())] = name;
  }
}

process.stdout.write(JSON.stringify(openings));
