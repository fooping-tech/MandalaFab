import { describe, it, expect } from "vitest";
import { listMotifs, getMotif, resolveParams } from "../src/geometry/motifs";
import { area, bounds, signedArea } from "../src/geometry/vec";
import { hasSelfIntersection } from "../src/validation";

describe("motif registry", () => {
  it("registers the MVP motifs", () => {
    const ids = listMotifs().map((m) => m.id);
    for (const id of ["circle", "dot", "petal", "leaf", "diamond", "triangle", "arc", "teardrop", "line", "wave", "spiral"]) expect(ids).toContain(id);
  });

  it("every motif builds valid geometry", () => {
    for (const def of listMotifs()) {
      const shape = def.build({ length: 20, width: 10, ringRadius: 40, tolerance: 0.02, params: resolveParams(def, {}) });
      expect(shape.closed.length + shape.open.length).toBeGreaterThan(0);
      for (const c of shape.closed) {
        expect(c.length).toBeGreaterThanOrEqual(3);
        expect(area(c)).toBeGreaterThan(0.5);
        expect(signedArea(c)).toBeGreaterThan(0); // outers are positive
        expect(hasSelfIntersection(c)).toBe(false);
      }
      for (const l of shape.open) expect(l.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("closed motifs respect length (radial) and width (tangential)", () => {
    for (const id of ["circle", "petal", "leaf", "diamond", "triangle", "teardrop", "line"]) {
      const def = getMotif(id);
      const c = def.build({ length: 20, width: 10, ringRadius: 40, tolerance: 0.02, params: resolveParams(def, {}) }).closed[0]!;
      const b = bounds([c]);
      expect(b.maxX - b.minX).toBeCloseTo(20, 1);
      expect(b.maxY - b.minY).toBeLessThanOrEqual(10.05);
      expect(b.maxY - b.minY).toBeGreaterThan(6);
    }
  });

  it("arc thickness equals length and it follows the ring radius", () => {
    const def = getMotif("arc");
    const c = def.build({ length: 3, width: 20, ringRadius: 50, tolerance: 0.02, params: {} }).closed[0]!;
    const b = bounds([c]);
    expect(b.maxX).toBeCloseTo(1.5, 2);
    for (const p of c) {
      const r = Math.hypot(p.x + 50, p.y);
      expect(r).toBeGreaterThan(48.4);
      expect(r).toBeLessThan(51.6);
    }
  });

  it("unknown params fall back to defaults and are clamped", () => {
    const def = getMotif("petal");
    expect(resolveParams(def, { bulge: 99 }).bulge).toBe(1.5);
    expect(resolveParams(def, {}).shoulder).toBe(0.35);
    expect(resolveParams(def, {}).bulge).toBe(1);
  });
});
