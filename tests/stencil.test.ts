import { describe, it, expect } from "vitest";
import { emptyProject, defaultRing, newElement, type Project, type Ring } from "../src/model/project";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil, unionApertures } from "../src/geometry/stencil/pipeline";
import { findIslands } from "../src/geometry/stencil/islands";
import { applyBridges, autoCenterCount, generateBridges, bridgeContour } from "../src/geometry/stencil/bridges";
import { validateStencil } from "../src/validation";
import { flattenRegions, union } from "../src/geometry/boolean";
import { rotate, dist } from "../src/geometry/vec";
import "../src/geometry/motifs";

function project(rings: Partial<Ring>[], symmetry = 8): Project {
  const p = emptyProject("test");
  p.symmetry = symmetry;
  p.center.type = "none";
  p.rings = rings.map((r, i) => defaultRing({ id: `ring${i}`, mirrorLocal: false, ...r }));
  return p;
}
const circleRing = (radius: number, diameter: number, strokeWidth: number): Partial<Ring> => ({ radius: 0, repeat: 1, elements: [newElement("circle", { x: radius, length: diameter, width: diameter, strokeWidth })] });

describe("islands", () => {
  it("a filled petal ring has no island", () => {
    const p = project([{ radius: 30, repeat: 8, elements: [newElement("petal", { length: 20, width: 10 })] }]);
    expect(findIslands(unionApertures(generateMandala(p)))).toHaveLength(0);
  });

  it("an outline circle (annulus) creates one central island", () => {
    const islands = findIslands(unionApertures(generateMandala(project([circleRing(0, 30, 2)]))));
    expect(islands).toHaveLength(1);
    expect(islands[0]!.radius).toBeLessThan(0.01);
    expect(Math.abs(islands[0]!.area - Math.PI * 14 * 14)).toBeLessThan(3);
  });

  it("nested annuli create nested islands and survive boolean ops", () => {
    const p = project([circleRing(0, 20, 2), circleRing(0, 40, 2)]);
    const regions = unionApertures(generateMandala(p));
    expect(regions).toHaveLength(1);
    expect(regions[0]!.children).toHaveLength(1);
    expect(findIslands(regions)).toHaveLength(2);
    // Difference with an empty clip must keep the nested child (regression: children were dropped).
    const after = flattenRegions(applyBridges(regions, []));
    expect(after).toHaveLength(2);
  });
});

describe("bridge generation", () => {
  it("autoCenterCount keeps symmetry and stays small", () => {
    expect(autoCenterCount(8)).toBe(8);
    expect(autoCenterCount(12)).toBe(6);
    expect(autoCenterCount(16)).toBe(8);
    expect(autoCenterCount(24)).toBe(8);
    expect(autoCenterCount(32)).toBe(8);
    expect(autoCenterCount(10)).toBe(5);
  });

  it("bridges a central island with symmetric bridges and removes it", () => {
    const apertures = unionApertures(generateMandala(project([circleRing(0, 30, 2)], 8)));
    const result = generateBridges(apertures, { width: 1.5, overlap: 0.3, symmetry: 8, centerCount: "auto", perIsland: 2 });
    expect(result.bridges).toHaveLength(8);
    expect(result.unresolved).toHaveLength(0);
    expect(findIslands(result.apertures)).toHaveLength(0);
    for (const b of result.bridges) expect(b.length).toBeCloseTo(2 + 0.6, 2);
    const step = (2 * Math.PI) / 8;
    const first = { x: result.bridges[0]!.x, y: result.bridges[0]!.y };
    for (let i = 1; i < 8; i++) expect(result.bridges.some((b) => dist({ x: b.x, y: b.y }, rotate(first, step * i)) < 1e-3)).toBe(true);
  });

  it("bridges off-center islands radially and keeps k-fold symmetry", () => {
    const p = project([{ radius: 40, repeat: 6, elements: [newElement("petal", { length: 20, width: 12, strokeWidth: 2 })] }], 6);
    const apertures = unionApertures(generateMandala(p));
    expect(findIslands(apertures)).toHaveLength(6);
    const result = generateBridges(apertures, { width: 1.5, overlap: 0.3, symmetry: 6, centerCount: "auto", perIsland: 2 });
    expect(findIslands(result.apertures)).toHaveLength(0);
    expect(result.bridges).toHaveLength(12);
    const step = (2 * Math.PI) / 6;
    for (const b of result.bridges) for (let i = 1; i < 6; i++) expect(result.bridges.some((o) => dist({ x: o.x, y: o.y }, rotate({ x: b.x, y: b.y }, step * i)) < 1e-3)).toBe(true);
  });

  it("bridge rectangle has the requested width and length", () => {
    const c = bridgeContour({ id: "b", x: 0, y: 0, length: 10, width: 1.5, rotation: Math.PI / 4, auto: true });
    expect(dist(c[0]!, c[1]!)).toBeCloseTo(10, 9);
    expect(dist(c[1]!, c[2]!)).toBeCloseTo(1.5, 9);
  });

  it("reconnects nested islands through the pipeline", () => {
    const p = project([circleRing(0, 20, 2), circleRing(0, 40, 2)], 12);
    const s = buildStencil(p, generateMandala(p));
    expect(s.islandsBefore).toHaveLength(2);
    expect(s.islands).toHaveLength(0);
    expect(s.bridges.length).toBe(12);
  });
});

describe("validateStencil", () => {
  const sheet = { width: 150, height: 150, outline: false, cornerRadius: 0 };
  const run = (p: Project) => {
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    return { s, v: validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet }) };
  };

  it("reports islands as errors when auto bridges are off", () => {
    const p = project([circleRing(0, 30, 2)]);
    p.bridges.auto = false;
    const { v } = run(p);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "island")).toBe(true);
  });

  it("flags bridges narrower than the minimum bridge width", () => {
    const p = project([circleRing(0, 30, 3)]);
    p.bridges.width = 0.8;
    p.constraints.minBridgeWidth = 1.5;
    const { s, v } = run(p);
    expect(v.ok).toBe(false);
    expect(v.issues.filter((i) => i.code === "bridge-too-narrow")).toHaveLength(s.bridges.length);
  });

  it("passes a bridged annulus with wide bridges", () => {
    const p = project([circleRing(0, 30, 3)]);
    p.bridges.width = 2;
    const { v } = run(p);
    expect(v.ok).toBe(true);
  });

  it("detects a thin wall between two close apertures", () => {
    const p = project([{ radius: 0, repeat: 1, elements: [newElement("shape", { motif: "line", x: 0, length: 20, width: 20 }), newElement("shape", { motif: "line", x: 20.4, length: 20, width: 20 })] }]);
    p.constraints.minGap = 1;
    const { v } = run(p);
    expect(v.issues.some((i) => i.code === "thin-material" && i.severity === "warning")).toBe(true);
  });

  it("detects duplicate paths and merges them in the union", () => {
    const el = () => newElement("circle", { length: 10, width: 10 });
    const p = project([
      { radius: 40, repeat: 8, elements: [el()] },
      { radius: 40, repeat: 8, elements: [el()] },
    ]);
    const { v } = run(p);
    expect(v.issues.some((i) => i.code === "duplicate-path")).toBe(true);
    expect(v.stats.regions).toBe(8);
  });

  it("small apertures are reported", () => {
    const p = project([{ radius: 40, repeat: 8, elements: [newElement("dot", { length: 0.5, width: 0.5 })] }]);
    const { v } = run(p);
    expect(v.issues.some((i) => i.code === "small-hole")).toBe(true);
  });
});

describe("union", () => {
  it("positive fill: a hole of one shape does not punch into another shape", () => {
    const outer = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];
    const hole = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }].reverse();
    const disc = [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }];
    const r = union([{ outer, holes: [hole] }, { outer: disc, holes: [] }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.holes).toHaveLength(1);
    expect(r[0]!.children).toHaveLength(1);
  });
});
