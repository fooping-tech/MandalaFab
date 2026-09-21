import { describe, expect, it } from "vitest";
import "../src/geometry/motifs";
import { defaultRing, emptyProject, newElement, type Project } from "../src/model/project";
import { normalizeProject } from "../src/model/validate";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildOutput, closestPoints, detectSymmetry, generateConnectors, materialComponents, materialCoversCenter, strayComponents } from "../src/geometry/stencil/output";
import { difference, flattenRegions, regionArea, union } from "../src/geometry/boolean";
import { sheetRegion } from "../src/geometry/stencil/sheet";
import { validateStencil } from "../src/validation";
import { exportSVG } from "../src/export/svg";
import { computeRender } from "../src/editor/pipeline";
import { loadPreset } from "../src/presets";
import { containsPoint } from "../src/geometry/vec";

/** A center disc plus a ring of 8 leaves that do not touch each other or the center. */
function petals(gapFromCenter = 4): Project {
  const p = emptyProject("petals");
  p.sheet = { width: 120, height: 120, outline: false, cornerRadius: 0 };
  p.center = { ...p.center, type: "none" };
  p.rings = [
    defaultRing({ id: "core", radius: 0, repeat: 1, mirrorLocal: false, elements: [newElement("dot", { id: "core-dot", length: 16, width: 16 })] }),
    defaultRing({ id: "leaves", radius: 8 + gapFromCenter + 9, repeat: 8, mirrorLocal: false, elements: [newElement("leaf", { id: "leaf", length: 18, width: 8, params: { tipSharpness: 0.85, bend: 0 } })] }),
  ];
  return p;
}

describe("output polarity: design / material / cut geometry", () => {
  it("stencil: material = sheet − cuts; positive: material = design ∪ connectors, cut = material boundary", () => {
    const p = petals();
    const g = generateMandala(p);
    const st = buildOutput(p, g);
    expect(st.polarity).toBe("stencil");
    const sheetArea = 120 * 120;
    const cutArea = regionArea(flattenRegions(st.cutGeometry));
    expect(regionArea(flattenRegions(st.materialGeometry))).toBeCloseTo(sheetArea - cutArea, 0);
    expect(materialCoversCenter(st)).toBe(false); // the core disc is cut out
    expect(st.connectors.length).toBe(0);

    p.output = { ...p.output, polarity: "positive" };
    const pos = buildOutput(p, g);
    expect(pos.polarity).toBe("positive");
    // design pieces: core + 8 leaves, all separate before connectors
    expect(pos.componentsBefore.length).toBe(9);
    expect(pos.connectors.length).toBeGreaterThanOrEqual(8);
    expect(pos.components.length).toBe(1);
    expect(materialCoversCenter(pos)).toBe(true);
    // material = design ∪ connectors, and the cut geometry is exactly the material boundary
    const expected = regionArea(flattenRegions(union([...flattenRegions(pos.designGeometry), ...pos.connectors.map((c) => ({ outer: c.contour, holes: [] }))])));
    expect(regionArea(flattenRegions(pos.materialGeometry))).toBeCloseTo(expected, 0);
    expect(regionArea(flattenRegions(pos.cutGeometry))).toBeCloseTo(regionArea(flattenRegions(pos.materialGeometry)), 6);
    // the material is inside the sheet and much smaller than it
    expect(regionArea(flattenRegions(pos.materialGeometry))).toBeLessThan(sheetArea * 0.3);
    // connectors are symmetric: 8-fold → 8 (or a multiple) bands of the same width
    expect(pos.connectors.length % 8).toBe(0);
    expect(pos.connectors.every((c) => Math.abs(c.width - Math.max(p.output.minConnectionWidth, p.constraints.minFeatureWidth)) < 1e-9)).toBe(true);
  });

  it("the same design switches between the two polarities and exports both", () => {
    const p = petals();
    const g = generateMandala(p);
    const st = exportSVG(p, buildOutput(p, g).cutGeometry);
    expect(st.svg).toContain('id="apertures"');
    expect(st.svg).toContain("stencil");
    expect(st.subpaths).toBe(9);
    p.output = { ...p.output, polarity: "positive" };
    const pos = exportSVG(p, buildOutput(p, g).cutGeometry);
    expect(pos.svg).toContain('id="cuts"');
    expect(pos.svg).toContain("positive cutout");
    // one part: a single outer contour (plus any inner cuts), far fewer subpaths than the 9 stencil holes
    expect(pos.subpaths).toBeGreaterThanOrEqual(1);
    expect(pos.subpaths).toBeLessThan(9);
    // the material paths (translated to sheet coordinates) surround the center
    expect(pos.svg.match(/M[\d.]+ [\d.]+/g)!.length).toBe(pos.subpaths);
  });

  it("normalizeProject defaults and clamps the output settings", () => {
    const raw = { ...petals(), output: { polarity: "positive", minConnectionWidth: 99, autoConnect: false } } as unknown;
    const p = normalizeProject(raw);
    expect(p.output.polarity).toBe("positive");
    expect(p.output.minConnectionWidth).toBe(20);
    expect(p.output.autoConnect).toBe(false);
    const q = normalizeProject({ ...petals(), output: undefined } as unknown);
    expect(q.output.polarity).toBe("stencil");
  });
});

describe("positive connectors", () => {
  it("closestPoints finds the gap between two squares and connectors join separate pieces", () => {
    const a = { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], holes: [] };
    const b = { outer: [{ x: 13, y: 2 }, { x: 23, y: 2 }, { x: 23, y: 12 }, { x: 13, y: 12 }], holes: [] };
    const r = closestPoints(a, b);
    expect(r.d).toBeCloseTo(3, 5);
    const parts = union([a, b]);
    expect(materialComponents(parts).length).toBe(2);
    const joined = generateConnectors(parts, { width: 2 });
    expect(joined.connectors.length).toBe(1);
    expect(materialComponents(joined.material).length).toBe(1);
    // beyond maxSpan nothing is connected
    const far = generateConnectors(parts, { width: 2, maxSpan: 1 });
    expect(far.connectors.length).toBe(0);
    expect(materialComponents(far.material).length).toBe(2);
  });

  it("a piece floating inside a hole is joined to the surrounding piece", () => {
    const ringOuter = [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }];
    const ringHole = [{ x: -10, y: -10 }, { x: -10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: -10 }];
    const inner = [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }];
    const parts = union([{ outer: ringOuter, holes: [ringHole] }, { outer: inner, holes: [] }]);
    const comps = materialComponents(parts);
    expect(comps.length).toBe(2);
    expect(comps.some((c) => c.nested)).toBe(true);
    const joined = generateConnectors(parts, { width: 2 });
    expect(materialComponents(joined.material).length).toBe(1);
  });
});

describe("positive-mode validation", () => {
  it("reports disconnected pieces when auto connect is off, and passes once connected", () => {
    const p = petals();
    p.output = { ...p.output, polarity: "positive", autoConnect: false };
    const g = generateMandala(p);
    const out = buildOutput(p, g);
    expect(out.components.length).toBe(9);
    const v = validateStencil({ geometry: g, stencil: out.stencil, constraints: p.constraints, sheet: p.sheet, output: out, minConnectionWidth: p.output.minConnectionWidth });
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "disconnected")).toBe(true);
    expect(v.stats.islands).toBe(8);
    p.output = { ...p.output, autoConnect: true };
    const out2 = buildOutput(p, g);
    const v2 = validateStencil({ geometry: g, stencil: out2.stencil, constraints: p.constraints, sheet: p.sheet, output: out2, minConnectionWidth: p.output.minConnectionWidth });
    expect(v2.issues.some((i) => i.code === "disconnected")).toBe(false);
    expect(v2.stats.bridges).toBe(out2.connectors.length);
    expect(v2.stats.islands).toBe(0);
    expect(v2.ok).toBe(true);
  });

  it("flags pieces that look connected but have a 0.2 mm gap, and thin necks below the connection width", () => {
    const p = petals(0.2);
    p.output = { ...p.output, polarity: "positive", autoConnect: false };
    const g = generateMandala(p);
    const out = buildOutput(p, g);
    const v = validateStencil({ geometry: g, stencil: out.stencil, constraints: p.constraints, sheet: p.sheet, output: out, minConnectionWidth: 1.5 });
    expect(v.issues.some((i) => i.code === "narrow-gap")).toBe(true);
    expect(v.issues.some((i) => i.code === "disconnected" || i.code === "isolated-ornament")).toBe(true);
    // a wide bar with a 0.6 mm neck: thin-neck warning at min connection width 1.5
    const q = emptyProject("neck");
    q.sheet = { width: 80, height: 80, outline: false, cornerRadius: 0 };
    q.center = { ...q.center, type: "none" };
    q.output = { ...q.output, polarity: "positive", autoConnect: false, minConnectionWidth: 1.5 };
    q.rings = [
      defaultRing({ id: "a", radius: 0, repeat: 1, mirrorLocal: false, elements: [newElement("dot", { length: 14, width: 14, x: -12 }), newElement("dot", { length: 14, width: 14, x: 12 }), newElement("connector", { from: { x: -8, y: 0 }, to: { x: 8, y: 0 }, bulge: 0, strokeWidth: 0.6, mode: "cut" })] }),
    ];
    const gq = generateMandala(q);
    const oq = buildOutput(q, gq);
    expect(oq.components.length).toBe(1);
    const vq = validateStencil({ geometry: gq, stencil: oq.stencil, constraints: q.constraints, sheet: q.sheet, output: oq, minConnectionWidth: 1.5 });
    expect(vq.issues.some((i) => i.code === "thin-neck")).toBe(true);
  });

  it("tiny separate ornaments are isolated-ornament, pieces inside holes are unsupported-island", () => {
    const q = emptyProject("bits");
    q.sheet = { width: 80, height: 80, outline: false, cornerRadius: 0 };
    q.center = { ...q.center, type: "none" };
    q.output = { ...q.output, polarity: "positive", autoConnect: false, minConnectionWidth: 1.5 };
    q.rings = [
      defaultRing({ id: "a", radius: 0, repeat: 1, mirrorLocal: false, elements: [newElement("circle", { length: 30, width: 30, strokeWidth: 3 }), newElement("dot", { length: 5, width: 5 }), newElement("dot", { x: 30, length: 2, width: 2 })] }),
    ];
    const gq = generateMandala(q);
    const oq = buildOutput(q, gq);
    const comps = oq.components;
    expect(comps.length).toBe(3);
    expect(strayComponents(comps).length).toBe(2);
    const vq = validateStencil({ geometry: gq, stencil: oq.stencil, constraints: q.constraints, sheet: q.sheet, output: oq, minConnectionWidth: 1.5 });
    expect(vq.issues.some((i) => i.code === "unsupported-island")).toBe(true);
    expect(vq.issues.some((i) => i.code === "isolated-ornament")).toBe(true);
  });
});

describe("presets in positive mode", () => {
  it("Dense Floral Stencil becomes one connected part with connectors and renders / exports", () => {
    const p = loadPreset("dense-floral");
    p.output = { ...p.output, polarity: "positive" };
    const r = computeRender(p);
    expect(r.polarity).toBe("positive");
    expect(r.counts.componentsBefore).toBeGreaterThan(1);
    expect(r.counts.connectors).toBeGreaterThan(0);
    expect(r.counts.components).toBeLessThanOrEqual(3);
    expect(r.materialPath.length).toBeGreaterThan(100);
    expect(r.exportSubpaths).toBeGreaterThan(0);
    const material = flattenRegions(buildOutput(p, generateMandala(p)).materialGeometry);
    expect(material.some((m) => containsPoint(m.outer, { x: 0, y: 0 }))).toBe(true);
    // waste = sheet − material is what the laser removes
    const waste = flattenRegions(difference([sheetRegion(p.sheet)], material));
    expect(regionArea(waste)).toBeGreaterThan(regionArea(material));
  }, 120000);
});

describe("positive connectors keep the design's symmetry", () => {
  const rot = (p: { x: number; y: number }, a: number) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const key = (p: { x: number; y: number }, q: { x: number; y: number }): string => {
    const k = (v: { x: number; y: number }) => `${Math.round(v.x * 10)},${Math.round(v.y * 10)}`;
    const a = k(p), b = k(q);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  // rounding to 0.1 mm can straddle a boundary; fall back to a distance scan
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 0.05;
  const lookup = (set: Set<string>, list: readonly { from: { x: number; y: number }; to: { x: number; y: number } }[], p: { x: number; y: number }, q: { x: number; y: number }): boolean =>
    set.has(key(p, q)) || list.some((c) => (near(c.from, p) && near(c.to, q)) || (near(c.from, q) && near(c.to, p)));

  it("derives the rotational order and mirror axis from the rings", () => {
    const p = petals();
    const sym = detectSymmetry(p);
    expect(sym.order).toBe(8);
    expect(sym.mirrorAxis).toBeNull(); // leaves ring is not mirrorLocal
    p.rings[1]!.mirrorLocal = true;
    p.rings[0]!.mirrorLocal = true;
    expect(detectSymmetry(p).mirrorAxis).not.toBeNull();
    const dense = loadPreset("dense-floral");
    const sd = detectSymmetry(dense);
    expect(sd.order).toBe(6); // one band repeats 6 times, the others 12
    expect(sd.mirrorAxis).not.toBeNull();
    // an unsymmetric extra ring breaks both
    dense.rings.push(defaultRing({ id: "odd", radius: 20, repeat: 1, mirrorLocal: false, elements: [newElement("dot")] }));
    expect(detectSymmetry(dense).order).toBe(1);
    expect(detectSymmetry(dense).mirrorAxis).toBeNull();
  });

  it("every connector has all its rotated (and mirrored) images among the connectors", () => {
    for (const [id, order] of [["ethnic-border", 8], ["dense-floral", 6]] as const) {
      const p = loadPreset(id);
      p.output = { ...p.output, polarity: "positive" };
      // a sheet large enough that nothing is clipped: the square sheet edge would break the symmetry
      p.sheet = { ...p.sheet, width: 240, height: 240 };
      const g = generateMandala(p);
      const out = buildOutput(p, g);
      expect(out.overflow).toBe(false);
      const sym = detectSymmetry(p);
      expect(sym.order).toBe(order);
      // (the total need not be a multiple of the order: a band on a symmetry axis is its own image)
      expect(out.components.length).toBe(1);
      const set = new Set(out.connectors.map((c) => key(c.from, c.to)));
      const step = (2 * Math.PI) / order;
      let missing = 0;
      for (const c of out.connectors) {
        for (let k = 1; k < order; k++) if (!lookup(set, out.connectors, rot(c.from, k * step), rot(c.to, k * step))) missing++;
        if (sym.mirrorAxis !== null) {
          const ax = sym.mirrorAxis;
          const mir = (q: { x: number; y: number }) => { const ux = Math.cos(ax), uy = Math.sin(ax); const d = q.x * ux + q.y * uy; return { x: 2 * d * ux - q.x, y: 2 * d * uy - q.y }; };
          if (!lookup(set, out.connectors, mir(c.from), mir(c.to))) missing++;
        }
      }
      expect(missing).toBe(0);
    }
  }, 180000);
});
