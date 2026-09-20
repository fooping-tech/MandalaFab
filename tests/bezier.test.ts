import { describe, it, expect } from "vitest";
import { flattenPath, segmentsFromPoints, pointsFromSegments, closedFromHalf, bulgeSegment } from "../src/geometry/bezier";
import { buildTeardrop, buildLeaf, buildSCurve, buildCurl, buildPaisley, buildElementShape, resolveElementParams } from "../src/geometry/elements/builders";
import { elementLocalRegions } from "../src/geometry/elements/sector";
import { newElement } from "../src/model/project";
import { hasSelfIntersection } from "../src/validation";
import { area, bounds, pointSegmentDistance, signedArea } from "../src/geometry/vec";
import "../src/geometry/motifs";

describe("cubic Bézier", () => {
  it("point list <-> segments round trip", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 0 }, { x: 4, y: -1 }, { x: 5, y: -1 }, { x: 6, y: 0 }];
    const segs = segmentsFromPoints(pts);
    expect(segs).toHaveLength(2);
    expect(pointsFromSegments(segs)).toEqual(pts);
  });

  it("flattening stays within tolerance of the true curve", () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
    const poly = flattenPath(pts, false, 0.02);
    expect(poly.length).toBeGreaterThan(10);
    // Every exact curve sample must lie within tolerance of the polyline.
    for (let t = 0; t <= 1; t += 0.01) {
      const mt = 1 - t;
      const x = 3 * mt * mt * t * 0 + 3 * mt * t * t * 10 + t * t * t * 10;
      const y = 3 * mt * mt * t * 10 + 3 * mt * t * t * 10;
      let best = Infinity;
      for (let i = 0; i + 1 < poly.length; i++) best = Math.min(best, pointSegmentDistance({ x, y }, poly[i]!, poly[i + 1]!));
      expect(best).toBeLessThan(0.03);
    }
  });

  it("closed paths drop a duplicated end point", () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 0 }, { x: 10, y: -5 }, { x: 5, y: -5 }, { x: 0, y: 0 }];
    const c = flattenPath(pts, true, 0.02);
    expect(c[0]).not.toEqual(c[c.length - 1]);
    expect(area(c)).toBeGreaterThan(30);
  });

  it("bulge segment is straight when bulge is 0", () => {
    const s = bulgeSegment({ x: 0, y: 0 }, { x: 9, y: 0 }, 0);
    expect(s.cp1.y).toBe(0);
    expect(s.cp2.y).toBe(0);
  });
});

describe("organic motifs", () => {
  it("teardrop / leaf / paisley are closed, simple, positively oriented and fit length × width", () => {
    const shapes = [buildTeardrop(20, 10, 0.6, 0, 0.02), buildTeardrop(20, 10, 1, 0, 0.02), buildTeardrop(20, 10, 0, 0, 0.02), buildLeaf(20, 10, 0.7, 0, 0.02), buildLeaf(20, 10, 0.2, 0.5, 0.02), buildPaisley(20, 10, 0.7, 0.7, 0.02)];
    for (const c of shapes) {
      expect(c.length).toBeGreaterThan(20);
      expect(hasSelfIntersection(c)).toBe(false);
      const b = bounds([c]);
      expect(b.maxX - b.minX).toBeCloseTo(20, 1);
      expect(area(c)).toBeGreaterThan(60);
    }
    expect(Math.abs(bounds([shapes[0]!]).maxY - 5)).toBeLessThan(0.05);
    expect(Math.abs(bounds([shapes[3]!]).maxY - 5)).toBeLessThan(0.05);
  });

  it("tipSharpness changes the tip: sharper tips are narrower near the tip", () => {
    const sharp = buildTeardrop(20, 10, 1, 0, 0.02);
    const round = buildTeardrop(20, 10, 0, 0, 0.02);
    const widthNear = (c: readonly { x: number; y: number }[], x: number) => Math.max(...c.filter((p) => Math.abs(p.x - x) < 0.5).map((p) => Math.abs(p.y)), 0);
    expect(widthNear(sharp, 8)).toBeLessThan(widthNear(round, 8));
  });

  it("curvature bends the teardrop to one side", () => {
    const bent = buildTeardrop(20, 10, 0.6, 0.8, 0.02);
    const tip = bent.reduce((a, b) => (b.x > a.x ? b : a));
    expect(tip.y).toBeGreaterThan(1);
  });

  it("S-curve and curl are open polylines that become closed bands", () => {
    const s = buildSCurve(20, 10, 0.6, 0.02);
    expect(s[0]).toEqual({ x: -10, y: -5 });
    expect(s[s.length - 1]).toEqual({ x: 10, y: 5 });
    const c = buildCurl(20, 10, 0, 1.5, 0.7, 1, 0.02);
    expect(c.length).toBeGreaterThan(30);
    const regions = elementLocalRegions(newElement("curl", { length: 20, width: 10, strokeWidth: 1.5 }), 40, 1, []);
    expect(regions.length).toBeGreaterThan(0);
    for (const r of regions) expect(signedArea(r.outer)).toBeGreaterThan(0);
  });

  it("every element type builds geometry with default params", () => {
    for (const type of ["teardrop", "leaf", "petal", "paisley", "scurve", "curl", "spiral", "arc", "dot", "circle", "bezier", "connector", "shape"] as const) {
      const el = newElement(type);
      const shape = buildElementShape(el, { length: el.length, width: el.width, ringRadius: 40, tolerance: 0.02, params: resolveElementParams(el) });
      expect(shape.closed.length + shape.open.length, type).toBeGreaterThan(0);
    }
  });

  it("inset leaves an inner copy attached by a stem", () => {
    const el = newElement("teardrop", { length: 16, width: 8, inset: 1.5, insetStem: 2 });
    const regions = elementLocalRegions(el, 40, 1, []);
    // One band region without a hole: the stem opens the ring so no island exists.
    expect(regions.every((r) => r.holes.length === 0)).toBe(true);
    const noStem = elementLocalRegions(newElement("teardrop", { length: 16, width: 8, inset: 1.5 }), 40, 1, []);
    expect(noStem.some((r) => r.holes.length === 1)).toBe(true);
  });

  it("closedFromHalf mirrors across the axis", () => {
    const c = closedFromHalf([{ start: { x: -5, y: 0 }, cp1: { x: -5, y: 4 }, cp2: { x: 5, y: 4 }, end: { x: 5, y: 0 } }], 0.02);
    const b = bounds([c]);
    expect(b.minY).toBeCloseTo(-b.maxY, 6);
  });
});
