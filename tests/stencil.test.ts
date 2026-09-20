import { describe, it, expect } from "vitest";
import { emptyProject, defaultRing } from "../src/model/project";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil, unionApertures } from "../src/geometry/stencil/pipeline";
import { findIslands } from "../src/geometry/stencil/islands";
import { applyBridges, autoCenterCount, generateBridges, bridgeContour } from "../src/geometry/stencil/bridges";
import { validateStencil } from "../src/validation";
import { flattenRegions, union } from "../src/geometry/boolean";
import { rotate, dist } from "../src/geometry/vec";
import "../src/geometry/motifs";

function project(rings: Parameters<typeof defaultRing>[0][], symmetry = 8) {
  const p = emptyProject("test");
  p.symmetry = symmetry;
  p.rings = rings.map((r, i) => defaultRing({ id: `ring${i}`, ...r }));
  return p;
}

describe("islands", () => {
  it("a filled petal ring has no island", () => {
    const p = project([{ motif: "petal", count: 8, radius: 30, length: 20, width: 10 }]);
    const g = generateMandala(p);
    expect(findIslands(unionApertures(g))).toHaveLength(0);
  });

  it("an outline circle (annulus) creates one central island", () => {
    const p = project([{ motif: "circle", count: 1, radius: 0, length: 30, width: 30, strokeWidth: 2 }]);
    const islands = findIslands(unionApertures(generateMandala(p)));
    expect(islands).toHaveLength(1);
    expect(islands[0]!.radius).toBeLessThan(0.01);
    expect(Math.abs(islands[0]!.area - Math.PI * 14 * 14)).toBeLessThan(3);
  });

  it("nested annuli create nested islands", () => {
    const p = project([
      { motif: "circle", count: 1, radius: 0, length: 20, width: 20, strokeWidth: 2 },
      { motif: "circle", count: 1, radius: 0, length: 40, width: 40, strokeWidth: 2 },
    ]);
    const regions = unionApertures(generateMandala(p));
    expect(regions).toHaveLength(1);
    expect(regions[0]!.children).toHaveLength(1);
    expect(findIslands(regions)).toHaveLength(2);
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
    const p = project([{ motif: "circle", count: 1, radius: 0, length: 30, width: 30, strokeWidth: 2 }], 8);
    const apertures = unionApertures(generateMandala(p));
    const result = generateBridges(apertures, { width: 1.5, overlap: 0.3, symmetry: 8, centerCount: "auto", perIsland: 2 });
    expect(result.bridges).toHaveLength(8);
    expect(result.unresolved).toHaveLength(0);
    expect(findIslands(result.apertures)).toHaveLength(0);
    // Bridge span is the band width plus overlap on both sides.
    for (const b of result.bridges) expect(b.length).toBeCloseTo(2 + 0.6, 2);
    // 8-fold symmetry of bridge positions.
    const step = (2 * Math.PI) / 8;
    const first = { x: result.bridges[0]!.x, y: result.bridges[0]!.y };
    for (let i = 1; i < 8; i++) {
      const expected = rotate(first, step * i);
      const found = result.bridges.some((b) => dist({ x: b.x, y: b.y }, expected) < 1e-3);
      expect(found).toBe(true);
    }
  });

  it("bridges off-center islands radially and keeps k-fold symmetry", () => {
    const p = project([{ motif: "petal", count: 6, radius: 40, length: 20, width: 12, strokeWidth: 2 }], 6);
    const apertures = unionApertures(generateMandala(p));
    expect(findIslands(apertures)).toHaveLength(6);
    const result = generateBridges(apertures, { width: 1.5, overlap: 0.3, symmetry: 6, centerCount: "auto", perIsland: 2 });
    expect(findIslands(result.apertures)).toHaveLength(0);
    expect(result.bridges).toHaveLength(12); // inward + outward for each of 6 islands
    const step = (2 * Math.PI) / 6;
    for (const b of result.bridges) {
      for (let i = 1; i < 6; i++) {
        const expected = rotate({ x: b.x, y: b.y }, step * i);
        expect(result.bridges.some((o) => dist({ x: o.x, y: o.y }, expected) < 1e-3)).toBe(true);
      }
    }
  });

  it("bridge rectangle has the requested width and length", () => {
    const c = bridgeContour({ id: "b", x: 0, y: 0, length: 10, width: 1.5, rotation: Math.PI / 4, auto: true });
    expect(dist(c[0]!, c[1]!)).toBeCloseTo(10, 9);
    expect(dist(c[1]!, c[2]!)).toBeCloseTo(1.5, 9);
  });

  it("applying bridges reconnects nested islands through the pipeline", () => {
    const p = project(
      [
        { motif: "circle", count: 1, radius: 0, length: 20, width: 20, strokeWidth: 2 },
        { motif: "circle", count: 1, radius: 0, length: 40, width: 40, strokeWidth: 2 },
      ],
      12,
    );
    const s = buildStencil(p, generateMandala(p));
    expect(s.islandsBefore).toHaveLength(2);
    expect(s.islands).toHaveLength(0);
    expect(s.bridges.length).toBe(12); // 6 per annulus (autoCenterCount(12) = 6)
    const flat = flattenRegions(applyBridges(s.apertures, s.bridges));
    expect(flat.every((r) => r.holes.length === 0)).toBe(true);
  });
});

describe("validateStencil", () => {
  const sheet = { width: 150, height: 150, outline: false, cornerRadius: 0 };

  it("reports islands as errors when auto bridges are off", () => {
    const p = project([{ motif: "circle", count: 1, radius: 0, length: 30, width: 30, strokeWidth: 2 }]);
    p.bridges.auto = false;
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "island")).toBe(true);
  });

  it("flags bridges narrower than the minimum bridge width", () => {
    const p = project([{ motif: "circle", count: 1, radius: 0, length: 30, width: 30, strokeWidth: 3 }]);
    p.bridges.width = 0.8;
    p.constraints.minBridgeWidth = 1.5;
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
    expect(v.ok).toBe(false);
    expect(v.issues.filter((i) => i.code === "bridge-too-narrow")).toHaveLength(s.bridges.length);
  });

  it("passes a plain filled design with wide bridges", () => {
    const p = project([{ motif: "circle", count: 1, radius: 0, length: 30, width: 30, strokeWidth: 3 }]);
    p.bridges.width = 2;
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
    expect(v.ok).toBe(true);
    expect(v.issues.filter((i) => i.code === "island")).toHaveLength(0);
  });

  it("detects thin material between two close apertures", () => {
    const p = project([
      { motif: "line", count: 1, radius: 0, length: 20, width: 20, rotationMode: "fixed" },
      { motif: "line", count: 1, radius: 20.4, length: 20, width: 20, rotationMode: "fixed" },
    ]);
    p.constraints.minGap = 1;
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
    expect(v.issues.some((i) => i.code === "thin-material")).toBe(true);
  });

  it("detects duplicate paths and self intersection", () => {
    const p = project([
      { motif: "circle", count: 8, radius: 40, length: 10, width: 10 },
      { motif: "circle", count: 8, radius: 40, length: 10, width: 10 },
    ]);
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
    expect(v.issues.some((i) => i.code === "duplicate-path")).toBe(true);
    // 16 raw circles collapse into 8 regions after union.
    expect(v.stats.regions).toBe(8);
  });

  it("small apertures are reported", () => {
    const p = project([{ motif: "dot", count: 8, radius: 40, length: 0.5, width: 0.5 }]);
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet });
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
