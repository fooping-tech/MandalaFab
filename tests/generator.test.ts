import { describe, it, expect } from "vitest";
import { generateProject } from "../src/generate";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { validateStencil } from "../src/validation";
import { PRESETS, loadPreset } from "../src/presets";
import { normalizeProject, parseProject } from "../src/model/validate";
import "../src/geometry/motifs";

describe("generator", () => {
  it("is deterministic for the same seed", () => {
    const a = generateProject({ symmetry: 12, complexity: 3, ringCount: 5, density: 0.5, seed: 42 });
    const b = generateProject({ symmetry: 12, complexity: 3, ringCount: 5, density: 0.5, seed: 42 });
    expect(JSON.stringify({ ...a, rings: a.rings.map(({ id, ...r }) => r) })).toBe(JSON.stringify({ ...b, rings: b.rings.map(({ id, ...r }) => r) }));
    const c = generateProject({ symmetry: 12, complexity: 3, ringCount: 5, density: 0.5, seed: 43 });
    expect(JSON.stringify(c.rings)).not.toBe(JSON.stringify(a.rings));
  });

  it("produces designs that fit the sheet and can be bridged", () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      const p = generateProject({ symmetry: 8, complexity: 4, ringCount: 6, density: 0.8, seed });
      const g = generateMandala(p);
      const s = buildStencil(p, g);
      expect(s.overflow).toBe(false);
      expect(s.islands).toHaveLength(0);
    }
  });
});

describe("presets", () => {
  it("all presets load, have no remaining islands and export without errors", () => {
    expect(PRESETS.length).toBe(8);
    for (const preset of PRESETS) {
      const p = loadPreset(preset.id);
      const g = generateMandala(p);
      const s = buildStencil(p, g);
      const v = validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
      expect(s.islands, preset.id).toHaveLength(0);
      expect(v.issues.filter((i) => i.severity === "error"), preset.id).toHaveLength(0);
    }
  });
});

describe("project validation", () => {
  it("clamps values and replaces unknown motifs", () => {
    const p = normalizeProject({ symmetry: 999, rings: [{ motif: "nope", count: -5, radius: 1e9 }] });
    expect(p.symmetry).toBe(64);
    expect(p.rings[0]!.motif).toBe("circle");
    expect(p.rings[0]!.count).toBe(1);
    expect(p.rings[0]!.radius).toBe(500);
  });
  it("rejects non-project JSON", () => {
    expect(() => parseProject("{}")).toThrow();
    expect(() => parseProject("not json")).toThrow();
  });
});
