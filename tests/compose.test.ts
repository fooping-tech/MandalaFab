import { describe, it, expect } from "vitest";
import "../src/geometry/motifs";
import { composeMandala, compositionStats, bandInterlocks, SectorContext, boundarySpine, TEMPLATE_NAMES, TEMPLATES, composeSector, type BandLayout } from "../src/generate/compose";
import { loadPreset } from "../src/presets";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { validateStencil } from "../src/validation";
import { buildTruePaisley, taperedBand, buildHook, cleanBand } from "../src/geometry/elements/builders";
import { elementLocalRegions } from "../src/geometry/elements/sector";
import { newElement, type Project } from "../src/model/project";
import { area, bounds, signedArea } from "../src/geometry/vec";
import { hasSelfIntersection } from "../src/validation";
import { regionArea, intersection, union, flattenRegions } from "../src/geometry/boolean";
import { mulberry32 } from "../src/generate/random";

const SETTINGS = { symmetry: 12, density: 0.9, gap: 1, boundaryGap: 1.6, minFeatureWidth: 1, maxRho: 100 };

function assertOrnamental(project: Project, label: string) {
  for (const ring of project.rings) {
    const s = compositionStats(ring);
    expect(s.primitives, `${label} ${ring.name} primitives`).toBeGreaterThanOrEqual(10);
    expect(s.byRole.primary, `${label} ${ring.name} primary`).toBe(1);
    expect(s.byRole.secondary, `${label} ${ring.name} secondary`).toBeGreaterThanOrEqual(1);
    expect(s.flowCurves, `${label} ${ring.name} flow`).toBeGreaterThanOrEqual(3);
    expect(s.boundaryConnections, `${label} ${ring.name} boundary`).toBeGreaterThanOrEqual(1);
  }
  const nestedKinds = new Set(project.rings.flatMap((r) => r.elements.flatMap((e) => (e.children?.length ? [`${e.type}>${e.children.map((c) => c.type).join(",")}`] : e.type === "paisley" && (e.params.innerCurl ?? 0) > 0 ? ["paisley>curl"] : []))));
  expect(nestedKinds.size, `${label} nested kinds`).toBeGreaterThanOrEqual(2);
  expect(bandInterlocks(project), `${label} interlocks`).toBeGreaterThanOrEqual(2);
}

describe("Ornamental Composition Engine", () => {
  it("Dense Floral Stencil meets the acceptance criteria and passes stencil validation", () => {
    const p = loadPreset("dense-floral");
    assertOrnamental(p, "dense-floral");
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
    expect(s.islands).toHaveLength(0);
    expect(v.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(s.overflow).toBe(false);
  });

  it("every template composes a sector with the grammar (primary / secondary / flow / filler / boundary)", () => {
    for (const name of TEMPLATE_NAMES) {
      const band: BandLayout = { index: 1, inner: 40, outer: 58, repeat: 10, phase: 18, interlock: 3 };
      const ring = composeSector(band, TEMPLATES[name]!, SETTINGS, mulberry32(7), name);
      const st = compositionStats(ring);
      expect(st.byRole.primary, name).toBe(1);
      expect(st.byRole.filler, name).toBeGreaterThanOrEqual(2);
      expect(st.flowCurves, name).toBeGreaterThanOrEqual(3);
      expect(st.boundaryConnections, name).toBeGreaterThanOrEqual(1);
      expect(st.primitives, name).toBeGreaterThanOrEqual(10);
    }
  });

  it("packing keeps separate cut shapes apart (no accidental fusion)", () => {
    const band: BandLayout = { index: 1, inner: 40, outer: 58, repeat: 12, phase: 15, interlock: 3 };
    const ring = composeSector(band, TEMPLATES.floralArabesque!, SETTINGS, mulberry32(3), "t");
    const ctx = new SectorContext(band, mulberry32(1), SETTINGS);
    const regs = ring.elements.filter((e) => e.role !== "boundary" && e.role !== "primary").map((e) => ({ e, r: ctx.regionsOf(e) }));
    for (let i = 0; i < regs.length; i++) for (let j = i + 1; j < regs.length; j++) {
      expect(regionArea(intersection(regs[i]!.r, regs[j]!.r)), `${regs[i]!.e.name} vs ${regs[j]!.e.name}`).toBeLessThan(1e-3);
    }
  });

  it("boundary connections end on the boundary gap with a tangent perpendicular to the boundary", () => {
    const band: BandLayout = { index: 0, inner: 30, outer: 48, repeat: 12, phase: 0, interlock: 3 };
    const ctx = new SectorContext(band, mulberry32(1), SETTINGS);
    const sp = boundarySpine(ctx, { x: 0, y: 3 }, { x: 0.3, y: 0.95 }, 42, 0.8);
    const end = sp.points[3];
    expect(ctx.boundaryDistance(end)).toBeCloseTo(0.8, 6);
    const t = sp.tangent(1);
    const n = ctx.boundaryNormal;
    // Tangent anti-parallel to the inward normal (heading into the boundary).
    expect(Math.abs(t.x * n.x + t.y * n.y)).toBeCloseTo(1, 6);
    // Reflection across the boundary continues the curve: the mirrored tangent equals -t.
    const reflect = (v: { x: number; y: number }) => ({ x: v.x - 2 * (v.x * n.x + v.y * n.y) * n.x, y: v.y - 2 * (v.x * n.x + v.y * n.y) * n.y });
    const rt = reflect(t);
    expect(rt.x).toBeCloseTo(-t.x, 6);
    expect(rt.y).toBeCloseTo(-t.y, 6);
  });

  it("composition is deterministic and density raises primitives", () => {
    const a = composeMandala({ symmetry: 8, density: 0.7, seed: 5 });
    const b = composeMandala({ symmetry: 8, density: 0.7, seed: 5 });
    const strip = (p: Project) => JSON.stringify(p.rings.map((r) => r.elements.map((e) => [e.type, e.x, e.y, e.rotation, e.length, e.width])));
    expect(strip(a)).toBe(strip(b));
    const lo = composeMandala({ symmetry: 8, density: 0.2, seed: 5 });
    const count = (p: Project) => p.rings.reduce((n, r) => n + r.elements.length, 0);
    expect(count(a)).toBeGreaterThan(count(lo));
  });
});

describe("true paisley and tapered bands", () => {
  it("paisley has a round base, an asymmetric belly and an inward-curling tip", () => {
    const ps = buildTruePaisley({ length: 20, width: 10, belly: 0.6, curlRadius: 0, curlAmount: 0.7, tipSharpness: 0.75, innerInset: 0, innerCurl: 0, direction: 1 }, 0.02);
    expect(hasSelfIntersection(ps.outer)).toBe(false);
    expect(signedArea(ps.outer)).toBeGreaterThan(0);
    const b = bounds([ps.outer]);
    expect(b.maxX - b.minX).toBeGreaterThan(14);
    // Belly: more area on the -dir side (outside of the curl) than on the +dir side near the base.
    const top = ps.outer.filter((p) => p.x < 0 && p.y > 0).length;
    const bottom = ps.outer.filter((p) => p.x < 0 && p.y < 0).length;
    expect(bottom).toBeGreaterThan(top * 0.6);
    // Curl: the spine's last point turned back (its x is less than the spine's max x).
    const maxX = Math.max(...ps.spine.map((p) => p.x));
    expect(ps.spine[ps.spine.length - 1]!.x).toBeLessThan(maxX - 0.5);
    const straight = buildTruePaisley({ length: 20, width: 10, belly: 0, curlRadius: 0, curlAmount: 0, tipSharpness: 0.75, innerInset: 0, innerCurl: 0, direction: 1 }, 0.02);
    expect(Math.abs(bounds([straight.outer]).maxY + bounds([straight.outer]).minY)).toBeLessThan(0.2);
  });

  it("paisley inner inset + internal curl produce nested cuts attached by a stem", () => {
    const el = newElement("paisley", { length: 22, width: 11, insetStem: 2, params: { belly: 0.5, curlRadius: 0, curlAmount: 0.6, tipSharpness: 0.75, innerInset: 1.6, innerCurl: 0.8, direction: 1 } });
    const regions = elementLocalRegions(el, 40, 1, []);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    const u = flattenRegions(union(regions));
    expect(u.every((r) => r.holes.length === 0)).toBe(true); // stem keeps the inner material connected
  });

  it("tapered band width follows the profile", () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const band = taperedBand(line, (t) => 3 - 2 * t, { roundStart: false });
    const b = bounds([band]);
    expect(b.maxY - b.minY).toBeCloseTo(3, 6);
    const nearEnd = band.filter((p) => Math.abs(p.x - 20) < 1e-6).map((p) => p.y);
    expect(Math.max(...nearEnd) - Math.min(...nearEnd)).toBeCloseTo(1, 6);
  });

  it("hook bands are cleaned of self-intersections", () => {
    const parts = cleanBand(buildHook(20, 10, 2.5, 0.35, 1, 1, 0.02));
    expect(parts.length).toBeGreaterThanOrEqual(1);
    for (const c of parts) expect(hasSelfIntersection(c)).toBe(false);
    expect(area(parts[0]!)).toBeGreaterThan(20);
  });

  it("nested children: keep subtracts, cut adds", () => {
    const base = newElement("teardrop", { length: 20, width: 10 });
    const a0 = regionArea(elementLocalRegions(base, 40, 1, []));
    const keep = newElement("teardrop", { length: 20, width: 10, children: [newElement("dot", { length: 3, width: 3, mode: "keep" })] });
    const cut = newElement("teardrop", { length: 20, width: 10, inset: 1.5, insetStem: 2, children: [newElement("teardrop", { x: 0, length: 8, width: 3, mode: "cut" })] });
    expect(regionArea(elementLocalRegions(keep, 40, 1, []))).toBeLessThan(a0 - 5);
    const cutRegions = elementLocalRegions(cut, 40, 1, []);
    expect(cutRegions.length).toBeGreaterThanOrEqual(2);
  });
});
