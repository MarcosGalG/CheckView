// Wrapper around the Stockfish WebAssembly build, which runs in a Web Worker and speaks UCI.

const MATE_SCORE = 100000;
const INIT_TIMEOUT_MS = 20000;

/**
 * Evaluation from White's point of view.
 * `cp` is in centipawns; for forced mates `mate` is the number of moves (negative if Black mates)
 * and `cp` is a large sentinel so evaluations stay comparable.
 */
function toWhitePerspective(score, sideToMove) {
  const sign = sideToMove === "w" ? 1 : -1;
  if (score.type === "mate") {
    const mate = score.value * sign;
    return { cp: Math.sign(mate || -sign) * (MATE_SCORE - Math.abs(mate)), mate };
  }
  return { cp: score.value * sign, mate: null };
}

function parseInfo(line) {
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.match(/ pv (.+)$/);
  return {
    type: score[1],
    value: Number(score[2]),
    pv: pv ? pv[1].split(" ") : [],
  };
}

export class Engine {
  constructor(workerUrl) {
    this.worker = new Worker(workerUrl);
    this.listeners = new Set();
    this.worker.onmessage = (event) => {
      const line = typeof event.data === "string" ? event.data : String(event.data);
      for (const listener of this.listeners) listener(line);
    };
    // Errors inside the worker (e.g. the WASM file failing to load) never produce a UCI reply,
    // so every pending wait is raced against this promise instead of hanging forever.
    this.failure = new Promise((_, reject) => {
      this.worker.onerror = (event) => {
        event.preventDefault();
        reject(new Error(`Engine worker error: ${event.message || "failed to load"}`));
      };
    });
    this.failure.catch(() => {});
    this.queue = Promise.resolve();
  }

  send(command) {
    this.worker.postMessage(command);
  }

  // Resolves with the first line accepted by `predicate`, passing every line to `onLine`.
  waitFor(predicate, onLine = () => {}) {
    const reply = new Promise((resolve) => {
      const listener = (line) => {
        onLine(line);
        if (predicate(line)) {
          this.listeners.delete(listener);
          resolve(line);
        }
      };
      this.listeners.add(listener);
    });
    return Promise.race([reply, this.failure]);
  }

  async init() {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Engine did not start in time")), INIT_TIMEOUT_MS);
    });
    try {
      const handshake = (async () => {
        const ready = this.waitFor((line) => line === "uciok");
        this.send("uci");
        await ready;
        const ok = this.waitFor((line) => line === "readyok");
        this.send("isready");
        await ok;
      })();
      await Promise.race([handshake, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Evaluates a position. Requests are serialized because the engine handles one search at a time.
   * Returns { cp, mate, bestMove, pv } with the score from White's point of view.
   */
  evaluate(fen, { depth }) {
    const run = async () => {
      let last = null;
      const done = this.waitFor(
        (line) => line.startsWith("bestmove"),
        (line) => {
          if (line.startsWith("info") && !line.includes(" upperbound") && !line.includes(" lowerbound")) {
            last = parseInfo(line) ?? last;
          }
        },
      );
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
      const bestLine = await done;

      const sideToMove = fen.split(" ")[1];
      const bestMove = bestLine.split(" ")[1];
      const score = toWhitePerspective(last ?? { type: "cp", value: 0 }, sideToMove);
      return { ...score, bestMove: bestMove === "(none)" ? null : bestMove, pv: last?.pv ?? [] };
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }
}
