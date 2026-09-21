import { describe, expect, it } from "vitest";
import { conditionStroke, polylineLength, resample, smooth } from "../src/geometry/stroke";
import { cubicsToPoints, fitClosedPolygon, fitCurve } from "../src/import/bezier-fit";

/** A jittery pen stroke along a sine wave: 1.5 mm/pt spacing with ±0.25 mm noise. */
function noisyWave(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let i = 0; i <= 40; i++) out.push({ x: i * 1.5 + rnd() * 0.25, y: Math.sin(i / 6) * 8 + rnd() * 0.25 });
  return out;
}

describe("stroke conditioning", () => {
  it("resample keeps endpoints and spaces points evenly", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }];
    const rs = resample(pts, 1);
    expect(rs[0]).toEqual({ x: 0, y: 0 });
    expect(rs[rs.length - 1]).toEqual({ x: 10, y: 5 });
    expect(rs.length).toBe(16);
    for (let i = 1; i < rs.length; i++) expect(Math.hypot(rs[i]!.x - rs[i - 1]!.x, rs[i]!.y - rs[i - 1]!.y)).toBeCloseTo(1, 5);
  });

  it("smoothing reduces jitter, keeps open endpoints, and wraps for closed loops", () => {
    const raw = noisyWave();
    const sm = smooth(raw, 3, false, 2);
    expect(sm[0]).toEqual(raw[0]);
    expect(sm[sm.length - 1]).toEqual(raw[raw.length - 1]);
    const rough = (p: { x: number; y: number }[]): number => {
      let s = 0;
      for (let i = 1; i < p.length - 1; i++) s += Math.abs(p[i + 1]!.y - 2 * p[i]!.y + p[i - 1]!.y);
      return s;
    };
    // the wave's own curvature stays (second differences of the clean wave), the jitter goes
    const clean = Array.from({ length: 41 }, (_, i) => ({ x: i * 1.5, y: Math.sin(i / 6) * 8 }));
    expect(rough(sm)).toBeLessThan(rough(raw) * 0.75);
    expect(rough(sm)).toBeGreaterThan(rough(clean) * 0.5);
    const circle = Array.from({ length: 36 }, (_, i) => ({ x: Math.cos((i / 36) * Math.PI * 2) * 10 + (i % 2 ? 0.3 : -0.3), y: Math.sin((i / 36) * Math.PI * 2) * 10 }));
    const cs = smooth(circle, 2, true, 1);
    for (const p of cs) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(9.2);
    expect(polylineLength(cs)).toBeLessThan(polylineLength(circle));
  });

  it("conditioned strokes fit with few, smooth cubic segments", () => {
    const raw = noisyWave();
    const pts = conditionStroke(raw, false);
    expect(pts.length).toBeGreaterThan(20);
    const cubics = fitCurve(pts, 0.35);
    expect(cubics.length).toBeLessThanOrEqual(6);
    const bez = cubicsToPoints(cubics);
    expect(bez.length).toBe(1 + 3 * cubics.length);
    // the curve still follows the wave: endpoints close to the raw ones
    expect(Math.hypot(bez[0]!.x - raw[0]!.x, bez[0]!.y - raw[0]!.y)).toBeLessThan(0.5);
    const closedRaw = Array.from({ length: 50 }, (_, i) => ({ x: Math.cos((i / 50) * Math.PI * 2) * 8 + (i % 3 === 0 ? 0.2 : 0), y: Math.sin((i / 50) * Math.PI * 2) * 6 }));
    const cpts = conditionStroke([...closedRaw, closedRaw[0]!], true);
    const cbez = fitClosedPolygon(cpts, 0.35);
    expect(cbez.length).toBeGreaterThanOrEqual(7);
    expect(cbez.length).toBeLessThanOrEqual(1 + 3 * 8);
  });

  it("degenerate input yields nothing", () => {
    expect(conditionStroke([], false)).toEqual([]);
    expect(conditionStroke([{ x: 1, y: 1 }, { x: 1, y: 1 }], false)).toEqual([]);
  });
});
