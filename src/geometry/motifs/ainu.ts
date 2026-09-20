/**
 * Ainu-inspired motifs (アイヌ文様): morew (渦巻き) with an optional ay-us thorn.
 * Built as tapered bands, so they live next to the curve builders.
 */
import { cleanBand, taperedBand } from "../elements/builders";
import type { Contour, Vec2 } from "../types";
import { ensureOrientation, simplifyContour } from "../vec";
import type { MotifDefinition } from "./registry";

const closed = (contours: Contour[]) => ({ closed: contours.map((c) => ensureOrientation(simplifyContour(c), true)), open: [] as Vec2[][] });

/**
 * A comma-shaped spiral band: a straight stem leading into an Archimedean spiral
 * whose band narrows so that neighbouring turns keep a gap of `gap` mm.
 * Returns the polyline and the width function to feed `taperedBand`.
 */
function spiralBand(stem: Vec2[], center: Vec2, rc: number, turns: number, dir: 1 | -1, w0: number, gap: number, shrink = 0.84): { line: Vec2[]; widthAt: (t: number) => number } {
  const start = { x: center.x - rc, y: center.y };
  const line: Vec2[] = [...stem, start];
  const n = Math.max(24, Math.ceil(turns * 48));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = Math.PI - dir * t * turns * Math.PI * 2;
    const r = rc * (1 - shrink * t);
    line.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
  }
  // Arc-length fraction where the spiral starts, so the stem can stay wide.
  let stemLen = 0;
  for (let i = 1; i < stem.length + 1; i++) stemLen += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  let total = stemLen;
  for (let i = stem.length + 1; i < line.length; i++) total += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  const ts = total > 0 ? stemLen / total : 0;
  const pitch = turns > 0 ? (rc * shrink) / turns : rc; // radial distance between successive turns
  const wSpiral = Math.max(0.6, Math.min(w0, pitch - gap));
  const widthAt = (t: number) => {
    if (t <= ts) {
      // Keep the head fat for the first half of the stem, then blend into the spiral width.
      const k = ts > 0 ? Math.max(0, t / ts - 0.45) / 0.55 : 1;
      return w0 + (wSpiral - w0) * k;
    }
    const u = (t - ts) / Math.max(1e-6, 1 - ts);
    return wSpiral * (1 - 0.6 * u);
  };
  return { line, widthAt };
}

/** Filled comma spiral, thick at the base and thin at the tip. `thorn` adds a spike on its back. */
export const morew: MotifDefinition = {
  id: "morew",
  label: "Morew（アイヌ渦巻き）",
  description: "根元が太く先が細い塗りの渦巻き。thorn で棘（アイウシ）を付ける。",
  params: [
    { key: "turns", label: "巻き数", min: 0.5, max: 2, step: 0.25, default: 1 },
    { key: "thorn", label: "棘の長さ比 (0=なし)", min: 0, max: 1, step: 0.05, default: 0 },
    { key: "direction", label: "向き (1 / -1)", min: -1, max: 1, step: 2, default: 1 },
    { key: "gap", label: "渦の隙間 (mm)", min: 0.6, max: 3, step: 0.1, default: 1.2 },
  ],
  build: ({ length, width, params, tolerance }) => {
    const dir: 1 | -1 = (params.direction ?? 1) < 0 ? -1 : 1;
    const turns = params.turns ?? 1;
    const gap = params.gap ?? 1.2;
    const rc = Math.min(width, length) * 0.45;
    const c = { x: length / 2 - rc, y: 0 };
    const w0 = width * 0.55;
    const stem: Vec2[] = [{ x: -length / 2 + w0 * 0.5, y: -width * 0.1 * dir }, { x: -length / 2 + (c.x - rc + length / 2) * 0.6, y: -width * 0.05 * dir }];
    const { line, widthAt } = spiralBand(stem, c, rc, turns, dir, w0, gap);
    const out: Contour[] = [...cleanBand(taperedBand(line, widthAt, { roundStart: true, tolerance }))];
    // A round head hides the kink where the wide stem meets the narrowing spiral band.
    const head: Vec2[] = [];
    const hn = 32;
    for (let i = 0; i < hn; i++) head.push({ x: stem[0]!.x + Math.cos((i / hn) * Math.PI * 2) * w0 * 0.5, y: stem[0]!.y + Math.sin((i / hn) * Math.PI * 2) * w0 * 0.5 });
    out.push(head);
    const thorn = params.thorn ?? 0;
    if (thorn > 0) {
      const th = thorn * width * 0.6;
      const base = -w0 / 2 - width * 0.1;
      const x0 = -length / 2 + w0 * 0.35;
      out.push([{ x: x0, y: (base + 0.8) * dir }, { x: x0 + width * 0.3, y: (base - th) * dir }, { x: x0 + width * 0.7, y: (base + 0.8) * dir }]);
    }
    return closed(out);
  },
};

/** Two spirals curling apart from a shared stem (ウレンモレウ). */
export const urenMorew: MotifDefinition = {
  id: "urenmorew",
  label: "Uren-morew（両渦巻き）",
  description: "1本の茎から左右へ逆向きに巻く塗りの渦。",
  params: [
    { key: "turns", label: "巻き数", min: 0.5, max: 1.5, step: 0.25, default: 0.75 },
    { key: "gap", label: "渦の隙間 (mm)", min: 0.6, max: 3, step: 0.1, default: 1.2 },
  ],
  build: ({ length, width, params, tolerance }) => {
    const turns = params.turns ?? 0.75;
    const gap = params.gap ?? 1.2;
    const rc = Math.min(width * 0.3, length * 0.34);
    const out: Contour[] = [];
    const split = { x: -length / 2 + length * 0.3, y: 0 };
    const stemW = Math.min(width * 0.16, length * 0.14);
    out.push([{ x: -length / 2, y: -stemW / 2 }, { x: split.x + 0.3, y: -stemW / 2 }, { x: split.x + 0.3, y: stemW / 2 }, { x: -length / 2, y: stemW / 2 }]);
    for (const dir of [1, -1] as const) {
      const c = { x: length / 2 - rc, y: dir * (width / 2 - rc) };
      const stem: Vec2[] = [split, { x: split.x + length * 0.12, y: dir * width * 0.12 }];
      const { line, widthAt } = spiralBand(stem, c, rc, turns, dir, stemW * 1.3, gap);
      out.push(...cleanBand(taperedBand(line, widthAt, { roundStart: false, tolerance })));
    }
    return closed(out);
  },
};

export const AINU_MOTIFS: readonly MotifDefinition[] = [morew, urenMorew];
