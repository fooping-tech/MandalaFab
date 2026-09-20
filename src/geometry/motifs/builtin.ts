import type { Contour, Vec2 } from "../types";
import { arcPoints, ensureOrientation, flattenCubic, simplifyContour } from "../vec";
import type { MotifContext, MotifDefinition, MotifShape } from "./registry";

const closed = (contours: Contour[]): MotifShape => ({ closed: contours.map((c) => ensureOrientation(simplifyContour(c), true)), open: [] });
const open = (lines: Vec2[][]): MotifShape => ({ closed: [], open: lines });

/** Ellipse with radial axis `length` and tangential axis `width`. */
function ellipse(rx: number, ry: number, tolerance: number): Contour {
  const r = Math.max(rx, ry);
  const n = Math.max(8, Math.ceil(arcCount(r, tolerance) / 4) * 4);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  return pts;
}

function arcCount(radius: number, tolerance: number): number {
  if (radius <= tolerance) return 8;
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  return Math.ceil((Math.PI * 2) / step);
}

/** Symmetric closed shape from one cubic half-curve mirrored across the x axis. */
function mirroredCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number): Contour {
  const upper: Vec2[] = [p0];
  flattenCubic(p0, p1, p2, p3, tolerance, upper);
  const lower = upper
    .slice(1, -1)
    .reverse()
    .map((p) => ({ x: p.x, y: -p.y }));
  return [...upper, ...lower];
}

export const circle: MotifDefinition = {
  id: "circle",
  label: "Circle",
  description: "楕円。幅と長さが同じなら真円。",
  params: [],
  build: ({ length, width, tolerance }) => closed([ellipse(length / 2, width / 2, tolerance)]),
};

export const dot: MotifDefinition = {
  id: "dot",
  label: "Dot",
  description: "直径 = サイズ の小さな円。",
  params: [],
  build: ({ width, tolerance }) => closed([ellipse(width / 2, width / 2, tolerance)]),
};

export const petal: MotifDefinition = {
  id: "petal",
  label: "Petal",
  description: "両端が尖った花びら。",
  params: [
    { key: "bulge", label: "ふくらみ", min: 0.3, max: 1.5, step: 0.05, default: 1 },
    { key: "shoulder", label: "肩の位置", min: 0.1, max: 0.9, step: 0.05, default: 0.35 },
  ],
  build: ({ length, width, tolerance, params }) => {
    const L = length / 2;
    const h = (width / 2) * (params.bulge ?? 1) * (4 / 3);
    const s = params.shoulder ?? 0.35;
    return closed([mirroredCubic({ x: -L, y: 0 }, { x: -L + length * s, y: h }, { x: L - length * s, y: h }, { x: L, y: 0 }, tolerance)]);
  },
};

export const leaf: MotifDefinition = {
  id: "leaf",
  label: "Leaf",
  description: "内側が丸く外側が尖った葉。",
  params: [{ key: "tip", label: "先端の細さ", min: 0.2, max: 0.95, step: 0.05, default: 0.6 }],
  build: ({ length, width, tolerance, params }) => {
    const L = length / 2;
    const h = (width / 2) * (4 / 3);
    const t = params.tip ?? 0.6;
    return closed([mirroredCubic({ x: -L, y: 0 }, { x: -L, y: h }, { x: L - length * t, y: h * 0.9 }, { x: L, y: 0 }, tolerance)]);
  },
};

export const diamond: MotifDefinition = {
  id: "diamond",
  label: "Diamond",
  description: "ひし形。",
  params: [{ key: "skew", label: "中心のずれ", min: -0.8, max: 0.8, step: 0.05, default: 0 }],
  build: ({ length, width, params }) => {
    const L = length / 2;
    const W = width / 2;
    const k = (params.skew ?? 0) * L;
    return closed([
      [
        { x: L, y: 0 },
        { x: k, y: W },
        { x: -L, y: 0 },
        { x: k, y: -W },
      ],
    ]);
  },
};

export const triangle: MotifDefinition = {
  id: "triangle",
  label: "Triangle",
  description: "外側に頂点を向けた三角形。",
  params: [],
  build: ({ length, width }) => {
    const L = length / 2;
    const W = width / 2;
    return closed([
      [
        { x: L, y: 0 },
        { x: -L, y: W },
        { x: -L, y: -W },
      ],
    ]);
  },
};

export const arc: MotifDefinition = {
  id: "arc",
  label: "Arc",
  description: "リングに沿った円弧帯。長さ=帯の厚み、サイズ=弧の長さ。",
  params: [],
  build: ({ length, width, ringRadius, tolerance }) => {
    const thickness = length;
    if (ringRadius < 1) {
      // No meaningful curvature near the center: emit a straight bar.
      return closed([
        [
          { x: thickness / 2, y: -width / 2 },
          { x: thickness / 2, y: width / 2 },
          { x: -thickness / 2, y: width / 2 },
          { x: -thickness / 2, y: -width / 2 },
        ],
      ]);
    }
    const rOuter = ringRadius + thickness / 2;
    const rInner = Math.max(0.05, ringRadius - thickness / 2);
    const half = width / 2 / ringRadius; // half sweep (rad) so the arc length at the ring radius is `width`
    const c = { x: -ringRadius, y: 0 };
    const outer = arcPoints(c, rOuter, -half, 2 * half, tolerance);
    const inner = arcPoints(c, rInner, half, -2 * half, tolerance);
    return closed([[...outer, ...inner]]);
  },
};

export const teardrop: MotifDefinition = {
  id: "teardrop",
  label: "Teardrop",
  description: "内側が丸く外側に尖る雫。",
  params: [],
  build: ({ length, width, tolerance }) => {
    const r = width / 2;
    const L = length / 2;
    const center = { x: -L + r, y: 0 };
    const tip = { x: L, y: 0 };
    const d = tip.x - center.x;
    if (d <= r + 1e-6) return closed([ellipse(L, r, tolerance)]);
    const alpha = Math.asin(r / d);
    const tangentAngle = Math.PI / 2 + alpha; // angle of the tangent point on the circle, from +x (tip direction)
    const start = tangentAngle;
    const sweep = 2 * Math.PI - 2 * tangentAngle;
    const arcPts = arcPoints(center, r, start, sweep, tolerance);
    return closed([[tip, ...arcPts]]);
  },
};

export const line: MotifDefinition = {
  id: "line",
  label: "Line",
  description: "放射方向の直線バー（長さ×サイズの矩形）。",
  params: [],
  build: ({ length, width }) => {
    const L = length / 2;
    const W = width / 2;
    return closed([
      [
        { x: L, y: -W },
        { x: L, y: W },
        { x: -L, y: W },
        { x: -L, y: -W },
      ],
    ]);
  },
};

export const wave: MotifDefinition = {
  id: "wave",
  label: "Wave",
  description: "接線方向の正弦波（線幅で帯にする）。",
  params: [{ key: "periods", label: "周期数", min: 0.5, max: 6, step: 0.5, default: 1.5 }],
  lineLike: true,
  build: ({ length, width, params, tolerance }) => {
    const periods = params.periods ?? 1.5;
    const amp = length / 2;
    const n = Math.max(16, Math.ceil((width * periods) / Math.max(0.2, Math.sqrt(tolerance * Math.max(1, amp)))));
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: Math.sin(t * periods * Math.PI * 2) * amp, y: -width / 2 + t * width });
    }
    return open([pts]);
  },
};

export const spiral: MotifDefinition = {
  id: "spiral",
  label: "Spiral",
  description: "渦巻き（線幅で帯にする）。",
  params: [{ key: "turns", label: "巻き数", min: 0.5, max: 4, step: 0.25, default: 1.5 }],
  lineLike: true,
  build: ({ length, width, params, tolerance }) => {
    const turns = params.turns ?? 1.5;
    const rMax = Math.min(length, width) / 2;
    const total = turns * Math.PI * 2;
    const n = Math.max(24, Math.ceil(total / Math.max(0.05, 2 * Math.acos(1 - Math.min(0.5, tolerance / Math.max(rMax, 1e-3))))));
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * total;
      const r = rMax * t;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return open([pts]);
  },
};

export const BUILTIN_MOTIFS: readonly MotifDefinition[] = [circle, dot, petal, leaf, diamond, triangle, arc, teardrop, line, wave, spiral];
