import { winPercent } from "../lib/classification.js";
import { CLASSIFICATION_COLORS } from "./classification-colors.js";
import { formatEval } from "./eval-bar.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Classifications marked with a dot on the graph.
const MARKED = new Set(["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"]);

// Gap between the hovered point and the tooltip, in pixels.
const TOOLTIP_OFFSET = 10;

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

/**
 * Win-chance graph over the game, White's share drawn from the bottom.
 * Point i is the position after ply i; point 0 is the starting position.
 * Hovering shows the evaluation at that point; clicking or dragging selects it.
 */
export class EvalGraph {
  constructor(svg, tooltip, onSelect) {
    this.svg = svg;
    this.tooltip = tooltip;
    this.moves = [];
    this.ply = 0;
    this.hover = null;
    this.points = [];

    const plyAt = (event) => {
      const { left, width } = svg.getBoundingClientRect();
      const ply = Math.round(((event.clientX - left) / width) * this.moves.length);
      return Math.max(0, Math.min(this.moves.length, ply));
    };
    svg.addEventListener("pointerdown", (event) => {
      if (this.moves.length === 0) return;
      svg.setPointerCapture(event.pointerId);
      onSelect(plyAt(event));
    });
    svg.addEventListener("pointermove", (event) => {
      if (this.moves.length === 0) return;
      const ply = plyAt(event);
      if (svg.hasPointerCapture(event.pointerId) && ply !== this.ply) onSelect(ply);
      if (ply !== this.hover) {
        this.hover = ply;
        this.render();
      }
    });
    svg.addEventListener("pointerleave", () => {
      this.hover = null;
      this.render();
    });
    new ResizeObserver(() => this.render()).observe(svg);
  }

  setMoves(moves) {
    this.moves = moves;
    this.render();
  }

  setCursor(ply) {
    this.ply = ply;
    this.render();
  }

  /** Stored evaluation of the position after `ply`, or null for unevaluated (book) positions. */
  evaluationAt(ply) {
    return ply === 0 ? this.moves[0]?.evalBefore ?? null : this.moves[ply - 1].evalAfter;
  }

  render() {
    const width = this.svg.clientWidth;
    const height = this.svg.clientHeight;
    const count = this.moves.length;
    if (!width || !height || count === 0) return;

    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const x = (ply) => (ply / count) * width;
    const y = (percent) => height - (percent / 100) * height;

    let last = 50;
    this.points = [[0, y(50)]];
    for (const move of this.moves) {
      if (move.evalAfter) last = winPercent(move.evalAfter.cp);
      this.points.push([x(move.ply), y(last)]);
    }

    const area = [`M0 ${height}`, ...this.points.map(([px, py]) => `L${px} ${py}`), `L${width} ${height} Z`].join(" ");
    const children = [
      svgElement("rect", { width, height, fill: "#403d39" }),
      svgElement("path", { d: area, fill: "#f4f4f4" }),
      svgElement("line", { x1: 0, x2: width, y1: height / 2, y2: height / 2, stroke: "#888", "stroke-width": 1, opacity: 0.6 }),
      svgElement("line", { x1: x(this.ply), x2: x(this.ply), y1: 0, y2: height, stroke: "#10ae7c", "stroke-width": 2 }),
    ];
    if (this.hover !== null) {
      const hx = x(this.hover);
      children.push(svgElement("line", { x1: hx, x2: hx, y1: 0, y2: height, stroke: "#9a9ea6", "stroke-width": 1 }));
    }
    for (const move of this.moves) {
      if (!MARKED.has(move.classification)) continue;
      const [px, py] = this.points[move.ply];
      children.push(svgElement("circle", {
        cx: px, cy: py, r: 3.5, fill: CLASSIFICATION_COLORS[move.classification], stroke: "#1f2125", "stroke-width": 1,
      }));
    }
    this.svg.replaceChildren(...children);
    this.renderTooltip(width, height);
  }

  renderTooltip(width, height) {
    const evaluation = this.hover === null ? null : this.evaluationAt(this.hover);
    this.tooltip.hidden = !evaluation;
    if (!evaluation) return;

    const [px, py] = this.points[this.hover];
    this.tooltip.textContent = formatEval(evaluation);
    // Beside the point, on the side with more room, and kept inside the graph vertically.
    const onLeft = px > width / 2;
    const { offsetWidth: tipWidth, offsetHeight: tipHeight } = this.tooltip;
    const left = onLeft ? px - TOOLTIP_OFFSET - tipWidth : px + TOOLTIP_OFFSET;
    const top = Math.max(0, Math.min(height - tipHeight, py - tipHeight / 2));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
}
