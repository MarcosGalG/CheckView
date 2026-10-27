import { winPercent } from "../lib/classification.js";

/** Human-readable evaluation from White's point of view: "+0.35", "-1.20", "M3", "-M2", "1-0". */
export function formatEval(evaluation) {
  if (!evaluation) return "";
  const { cp, mate } = evaluation;
  if (mate === 0) return cp > 0 ? "1-0" : "0-1";
  if (mate !== null) return mate > 0 ? `M${mate}` : `-M${-mate}`;
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function shortEval(evaluation) {
  const { cp, mate } = evaluation;
  if (mate === 0) return cp > 0 ? "1-0" : "0-1";
  if (mate !== null) return `M${Math.abs(mate)}`;
  return (Math.abs(cp) / 100).toFixed(1);
}

export class EvalBar {
  constructor(root) {
    this.root = root;
    this.fill = root.querySelector(".eval-fill");
    this.label = root.querySelector(".eval-label");
    this.whiteAtBottom = true;
  }

  setOrientation(color) {
    this.whiteAtBottom = color === "white";
    this.root.classList.toggle("flipped", !this.whiteAtBottom);
  }

  update(evaluation) {
    if (!evaluation) return;
    this.fill.style.height = `${winPercent(evaluation.cp)}%`;

    // The number sits at the end of the side that is ahead, like on most analysis boards.
    const whiteAhead = evaluation.cp >= 0;
    const atBottom = whiteAhead === this.whiteAtBottom;
    this.label.textContent = shortEval(evaluation);
    this.label.classList.toggle("bottom", atBottom);
    this.label.classList.toggle("top", !atBottom);
    this.label.style.color = whiteAhead ? "#403d39" : "#f4f4f4";
  }
}
