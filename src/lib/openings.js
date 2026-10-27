// Opening book lookups backed by data/openings.json (see scripts/build-openings.mjs).

/** Position identity ignoring move counters: board, side to move, castling and en passant. */
export function positionKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

export async function loadOpenings(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load openings (${response.status})`);
  return response.json();
}
