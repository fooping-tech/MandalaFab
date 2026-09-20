/**
 * Step 5a: contour tracing with marching squares on the binary image (iso level
 * 0.5 between pixel centres). Produces closed polygons in pixel coordinates;
 * holes are detected by containment parity.
 */
import type { BinaryImage, Point, TracedContour } from "./types";

function key(p: Point): string {
  return `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`;
}

/**
 * Trace all iso-contours. Each cell between four pixel centres emits directed
 * segments (ink kept on the left), which are then linked into loops.
 */
export function traceContours(b: BinaryImage): TracedContour[] {
  const w = b.width;
  const h = b.height;
  // Pad by one so every shape closes.
  const W = w + 2;
  const H = h + 2;
  const at = (x: number, y: number): number => (x <= 0 || y <= 0 || x > w || y > h ? 0 : b.data[(y - 1) * w + (x - 1)]!);
  // Segment endpoints are edge midpoints; midpoint of edge between (x,y) and (x+1,y) is (x+0.5, y) in padded coords.
  const segs: [Point, Point][] = [];
  const top = (x: number, y: number): Point => ({ x: x + 0.5, y });
  const bottom = (x: number, y: number): Point => ({ x: x + 0.5, y: y + 1 });
  const left = (x: number, y: number): Point => ({ x, y: y + 0.5 });
  const right = (x: number, y: number): Point => ({ x: x + 1, y: y + 0.5 });
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      // Directed so that ink is on the left when walking (y down: "left" = counter-clockwise on screen).
      const add = (a: Point, c: Point): void => {
        segs.push([a, c]);
      };
      switch (code) {
        case 1: add(bottom(x, y), left(x, y)); break;
        case 2: add(right(x, y), bottom(x, y)); break;
        case 3: add(right(x, y), left(x, y)); break;
        case 4: add(top(x, y), right(x, y)); break;
        case 5: add(top(x, y), left(x, y)); add(bottom(x, y), right(x, y)); break;
        case 6: add(top(x, y), bottom(x, y)); break;
        case 7: add(top(x, y), left(x, y)); break;
        case 8: add(left(x, y), top(x, y)); break;
        case 9: add(bottom(x, y), top(x, y)); break;
        case 10: add(left(x, y), bottom(x, y)); add(right(x, y), top(x, y)); break;
        case 11: add(right(x, y), top(x, y)); break;
        case 12: add(left(x, y), right(x, y)); break;
        case 13: add(bottom(x, y), right(x, y)); break;
        case 14: add(left(x, y), bottom(x, y)); break;
      }
    }
  }
  // Link segments into loops.
  const byStart = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const k = key(s[0]);
    const list = byStart.get(k);
    if (list) list.push(i);
    else byStart.set(k, [i]);
  });
  const used = new Uint8Array(segs.length);
  const loops: Point[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    const loop: Point[] = [];
    let cur = i;
    let guard = 0;
    while (!used[cur] && guard++ < segs.length + 1) {
      used[cur] = 1;
      const s = segs[cur]!;
      loop.push(s[0]);
      const next = byStart.get(key(s[1]));
      if (!next) break;
      const cand = next.find((j) => !used[j]);
      if (cand === undefined) break;
      cur = cand;
    }
    if (loop.length >= 3) loops.push(loop.map((p) => ({ x: p.x - 1, y: p.y - 1 })));
  }
  const area = (c: Point[]): number => {
    let a = 0;
    for (let i = 0, n = c.length; i < n; i++) {
      const p = c[i]!;
      const q = c[(i + 1) % n]!;
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  const contains = (c: Point[], p: Point): boolean => {
    let inside = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const a = c[i]!;
      const d = c[j]!;
      if (a.y > p.y !== d.y > p.y && p.x < ((d.x - a.x) * (p.y - a.y)) / (d.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const out: TracedContour[] = loops.map((points) => ({ points, hole: false, area: Math.abs(area(points)) }));
  // Hole = contained in an odd number of other loops.
  for (const c of out) {
    const p = c.points[0]!;
    let depth = 0;
    for (const o of out) if (o !== c && o.area > c.area && contains(o.points, p)) depth++;
    c.hole = depth % 2 === 1;
  }
  return out.sort((a, b2) => b2.area - a.area);
}

/**
 * Line-art "cells": the regions enclosed by the strokes. The mask is inverted,
 * traced, and the background (loops touching the image border, or larger than
 * `maxFraction` of the image) is removed. What remains are the paper cells that
 * a stencil cuts out while the strokes stay as the material web.
 */
export function traceCells(b: BinaryImage, minAreaPx: number, maxFraction = 0.3): TracedContour[] {
  const inv: BinaryImage = { width: b.width, height: b.height, data: b.data.map((v) => (v ? 0 : 1)) };
  const all = traceContours(inv);
  const limit = b.width * b.height * maxFraction;
  return all.filter((c) => {
    if (c.area < minAreaPx || c.area > limit) return false;
    const touches = c.points.some((p) => p.x <= 0.5 || p.y <= 0.5 || p.x >= b.width - 1.5 || p.y >= b.height - 1.5);
    return !touches;
  });
}

/** Median stroke width (px) of the ink, estimated from 2·area / perimeter of the traced outers. */
export function estimateStrokeWidth(contours: readonly TracedContour[]): number {
  const widths: number[] = [];
  for (const c of contours) {
    if (c.hole || c.points.length < 3) continue;
    let per = 0;
    for (let i = 0; i < c.points.length; i++) {
      const p = c.points[i]!;
      const q = c.points[(i + 1) % c.points.length]!;
      per += Math.hypot(q.x - p.x, q.y - p.y);
    }
    if (per > 0) widths.push((2 * c.area) / per);
  }
  if (widths.length === 0) return 0;
  widths.sort((a, b2) => a - b2);
  return widths[Math.floor(widths.length / 2)]!;
}
