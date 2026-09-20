import { describe, it, expect } from "vitest";
import { defaultRing, emptyProject, newElement, type CompoundMotif } from "../src/model/project";
import { buildSector, elementTransform, localRepeatAngles, mirrorRegionY } from "../src/geometry/elements/sector";
import { buildCenter } from "../src/geometry/center";
import { generateMandala } from "../src/geometry/radial/mandala";
import { union, flattenRegions, regionArea } from "../src/geometry/boolean";
import { area, centroid, signedArea } from "../src/geometry/vec";
import "../src/geometry/motifs";

const ctx = { compounds: [] as CompoundMotif[], constraints: emptyProject().constraints };

describe("sector assembly", () => {
  it("mirrorLocal adds a y-mirrored copy of off-axis elements and none for on-axis symmetric ones", () => {
    const ring = defaultRing({ radius: 40, repeat: 8, mirrorLocal: true, elements: [newElement("teardrop", { x: 0, y: 0, length: 10, width: 4 }), newElement("leaf", { x: 2, y: 5, rotation: 30, length: 8, width: 3 })] });
    const s = buildSector(ring, ctx);
    expect(s.elements[0]!.regions).toHaveLength(1);
    expect(s.elements[1]!.regions).toHaveLength(2);
    const [a, b] = s.elements[1]!.regions;
    const ca = centroid(a!.outer);
    const cb = centroid(b!.outer);
    expect(ca.x).toBeCloseTo(cb.x, 6);
    expect(ca.y).toBeCloseTo(-cb.y, 6);
    expect(signedArea(b!.outer)).toBeGreaterThan(0);
  });

  it("local repeat spreads copies inside the sector around the mandala center", () => {
    expect(localRepeatAngles(newElement("dot", { repeat: 1 }), 30)).toEqual([0]);
    const angles = localRepeatAngles(newElement("dot", { repeat: 2 }), 30);
    expect(angles[0]).toBeCloseTo((-7.5 * Math.PI) / 180, 9);
    expect(angles[1]).toBeCloseTo((7.5 * Math.PI) / 180, 9);
    const ring = defaultRing({ radius: 40, repeat: 12, mirrorLocal: false, elements: [newElement("dot", { x: 0, y: 0, length: 2, width: 2, repeat: 3 })] });
    const s = buildSector(ring, ctx);
    expect(s.cuts).toHaveLength(3);
    for (const r of s.cuts) expect(Math.hypot(centroid(r.outer).x + 40, centroid(r.outer).y)).toBeCloseTo(40, 3);
  });

  it("keep elements subtract material from earlier cuts", () => {
    const ring = defaultRing({ radius: 40, repeat: 8, mirrorLocal: false, elements: [newElement("circle", { length: 10, width: 10 }), newElement("connector", { from: { x: -8, y: 0 }, to: { x: 8, y: 0 }, strokeWidth: 2, mode: "keep" })] });
    const s = buildSector(ring, ctx);
    const a = regionArea(flattenRegions(union(s.cuts)));
    expect(a).toBeLessThan(Math.PI * 25 - 15);
    expect(a).toBeGreaterThan(Math.PI * 25 - 25);
  });

  it("radial orientation rotates an element toward the mandala center direction", () => {
    const t = elementTransform(newElement("teardrop", { x: 0, y: 40, orient: "radial" }), 40);
    expect(t.rotation).toBeCloseTo(Math.PI / 4, 9);
    const t2 = elementTransform(newElement("teardrop", { x: 0, y: 40, orient: "sector" }), 40);
    expect(t2.rotation).toBeCloseTo(0, 9);
  });

  it("compound motifs are placed with their transform and can be reused", () => {
    const comp: CompoundMotif = { id: "unit", name: "unit", elements: [newElement("teardrop", { length: 8, width: 4 }), newElement("dot", { x: 6, length: 2, width: 2 })] };
    const ring = defaultRing({ radius: 40, repeat: 8, mirrorLocal: false, elements: [newElement("compound", { ref: "unit", x: 3, y: 2, rotation: 90 })] });
    const s = buildSector(ring, { ...ctx, compounds: [comp] });
    expect(s.cuts).toHaveLength(2);
    const dot = s.cuts[1]!;
    const c = centroid(dot.outer);
    expect(c.x).toBeCloseTo(3, 3);
    expect(c.y).toBeCloseTo(8, 3);
  });

  it("mirrorRegionY keeps orientation", () => {
    const r = { outer: [{ x: 0, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 0, y: 3 }], holes: [] };
    const m = mirrorRegionY(r);
    expect(Math.sign(signedArea(m.outer))).toBe(Math.sign(signedArea(r.outer)));
    expect(centroid(m.outer).y).toBeCloseTo(-2, 9);
  });

  it("the whole mandala is k-fold symmetric", () => {
    const p = emptyProject();
    p.symmetry = 6;
    p.rings = [defaultRing({ radius: 35, repeat: 6, mirrorLocal: true, elements: [newElement("paisley", { y: 4, rotation: 15, length: 12, width: 6 }), newElement("curl", { y: 6, x: 4, rotation: 40, length: 8, width: 5, strokeWidth: 1.2 })] })];
    const g = generateMandala(p);
    const ring = g.rings[0]!;
    expect(ring.instances).toHaveLength(6);
    const a0 = ring.instances[0]!.regions.reduce((n, r) => n + area(r.outer), 0);
    for (const inst of ring.instances) expect(inst.regions.reduce((n, r) => n + area(r.outer), 0)).toBeCloseTo(a0, 6);
  });
});

describe("center motifs", () => {
  it("builds every center type with the requested petal count", () => {
    for (const type of ["radialPetals", "sunflower", "starburst", "circularPetals"] as const) {
      const regions = buildCenter({ type, petals: 12, innerRadius: 4, outerRadius: 16, petalWidth: 3, coreRadius: 2, strokeWidth: 0, rotation: 0 });
      expect(regions.length, type).toBeGreaterThanOrEqual(13);
      for (const r of regions) for (const p of r.outer) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(16 + 4 + 1e-6);
    }
    expect(buildCenter({ type: "none", petals: 12, innerRadius: 4, outerRadius: 16, petalWidth: 3, coreRadius: 2, strokeWidth: 0, rotation: 0 })).toHaveLength(0);
  });
});
