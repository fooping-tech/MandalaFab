import { describe, it, expect } from "vitest";
import { generateProject } from "../src/generate";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { validateStencil } from "../src/validation";
import { exportSVG } from "../src/export/svg";
import { PRESETS, loadPreset } from "../src/presets";
import { normalizeProject, parseProject } from "../src/model/validate";
import "../src/geometry/motifs";

const strip = (p: ReturnType<typeof generateProject>) => JSON.stringify({ ...p, rings: p.rings.map(({ id, elements, ...r }) => ({ ...r, elements: elements.map(({ id: _i, ...e }) => e) })) });

describe("generator", () => {
  it("is deterministic for the same seed", () => {
    const a = generateProject({ symmetry: 12, density: 0.7, seed: 42 });
    const b = generateProject({ symmetry: 12, density: 0.7, seed: 42 });
    expect(strip(a)).toBe(strip(b));
    const c = generateProject({ symmetry: 12, density: 0.7, seed: 43 });
    expect(strip(c)).not.toBe(strip(a));
  });

  it("density raises bands and element counts", () => {
    const lo = generateProject({ symmetry: 8, density: 0.1, seed: 7 });
    const hi = generateProject({ symmetry: 8, density: 1, seed: 7 });
    const count = (p: typeof lo) => p.rings.reduce((n, r) => n + r.elements.length, 0);
    expect(hi.rings.length).toBeGreaterThan(lo.rings.length);
    expect(count(hi)).toBeGreaterThan(count(lo));
  });

  it("produces designs that fit the sheet and can be bridged", () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      const p = generateProject({ symmetry: 8, density: 0.8, seed });
      const s = buildStencil(p, generateMandala(p));
      expect(s.overflow, `seed ${seed}`).toBe(false);
      expect(s.islands, `seed ${seed}`).toHaveLength(0);
    }
  });
});

describe("presets", () => {
  it("all presets load, have no remaining islands and no validation errors", () => {
    expect(PRESETS.length).toBe(5);
    for (const preset of PRESETS) {
      const p = loadPreset(preset.id);
      const g = generateMandala(p);
      const s = buildStencil(p, g);
      const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
      expect(s.islands, preset.id).toHaveLength(0);
      expect(v.issues.filter((i) => i.severity === "error"), preset.id).toHaveLength(0);
    }
  });

  it("Dense Floral Stencil is ornate: many organic element types, >= 100 exported shapes, validation passes", () => {
    const p = loadPreset("dense-floral");
    const types = new Set(p.rings.flatMap((r) => r.elements.map((e) => e.type)));
    for (const t of ["teardrop", "leaf", "curl", "paisley", "scurve"]) expect(types.has(t as never), t).toBe(true);
    expect(p.rings.length).toBeGreaterThanOrEqual(4);
    const g = generateMandala(p);
    const s = buildStencil(p, g);
    const { svg, subpaths } = exportSVG(p, s.final);
    expect(subpaths).toBeGreaterThanOrEqual(100);
    expect((svg.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(100);
    const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
    expect(v.ok).toBe(true);
    expect(s.islands).toHaveLength(0);
  });
});

describe("project validation", () => {
  it("clamps values and replaces unknown element types", () => {
    const p = normalizeProject({ symmetry: 999, rings: [{ radius: 1e9, repeat: -5, elements: [{ type: "nope", length: -3 }] }] });
    expect(p.symmetry).toBe(64);
    expect(p.rings[0]!.repeat).toBe(1);
    expect(p.rings[0]!.radius).toBe(500);
    expect(p.rings[0]!.elements[0]!.type).toBe("teardrop");
    expect(p.rings[0]!.elements[0]!.length).toBe(0.2);
  });

  it("migrates v1 projects (motif rings) to v2 sectors", () => {
    const v1 = { version: 1, symmetry: 8, rings: [{ id: "old", motif: "petal", count: 8, radius: 30, length: 20, width: 10, strokeWidth: 0 }, { motif: "heart", count: 4, radius: 50, length: 10, width: 10, direction: "inward" }] };
    const p = normalizeProject(v1);
    expect(p.version).toBe(2);
    expect(p.center.type).toBe("none");
    expect(p.rings[0]!.repeat).toBe(8);
    expect(p.rings[0]!.elements[0]!.type).toBe("petal");
    expect(p.rings[1]!.elements[0]!.type).toBe("shape");
    expect(p.rings[1]!.elements[0]!.rotation).toBe(180);
    const s = buildStencil(p, generateMandala(p));
    expect(s.final.length).toBeGreaterThan(0);
  });

  it("rejects non-project JSON", () => {
    expect(() => parseProject("{}")).toThrow();
    expect(() => parseProject("not json")).toThrow();
  });
});
