import { describe, it, expect } from "vitest";
import { emptyProject, defaultRing } from "../src/model/project";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { exportSVG, formatNumber, projectFromSVG, regionsPathData } from "../src/export/svg";
import { normalizeProject } from "../src/model/validate";
import "../src/geometry/motifs";

function sample() {
  const p = emptyProject("Test Mandala");
  p.sheet = { width: 100, height: 120, outline: true, cornerRadius: 0 };
  p.rings = [
    defaultRing({ id: "a", motif: "petal", count: 8, radius: 30, length: 20, width: 10 }),
    defaultRing({ id: "b", motif: "circle", count: 1, radius: 0, length: 20, width: 20, strokeWidth: 2 }),
  ];
  return p;
}

describe("SVG export", () => {
  it("uses mm units and a matching viewBox with no transforms", () => {
    const p = sample();
    const s = buildStencil(p, generateMandala(p));
    const { svg } = exportSVG(p, s.final);
    expect(svg).toContain('width="100mm"');
    expect(svg).toContain('height="120mm"');
    expect(svg).toContain('viewBox="0 0 100 120"');
    expect(svg).not.toContain("transform=");
    expect(svg).not.toContain("<text");
    expect(svg).toContain('id="outline"');
    expect(svg).toContain('id="apertures"');
  });

  it("emits only closed subpaths (M ... Z) with bounded precision", () => {
    const p = sample();
    const s = buildStencil(p, generateMandala(p));
    const { svg, subpaths } = exportSVG(p, s.final);
    const d = svg.match(/id="apertures" d="([^"]+)"/)![1]!;
    const subs = d.split("M").filter(Boolean);
    expect(subs.length).toBe(subpaths);
    for (const sp of subs) expect(sp.endsWith("Z")).toBe(true);
    for (const num of d.match(/-?\d+(\.\d+)?/g)!) {
      const frac = num.split(".")[1];
      if (frac) expect(frac.length).toBeLessThanOrEqual(3);
    }
    // All points inside the sheet.
    for (const m of d.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)) {
      const x = Number(m[2]);
      const y = Number(m[3]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(120);
    }
  });

  it("removes duplicate subpaths", () => {
    const c = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const r = { outer: c, holes: [], children: [], childHole: [] };
    const out = regionsPathData([r, r], { x: 0, y: 0 }, 3);
    expect(out.subpaths).toBe(1);
    expect(out.dropped).toBe(1);
  });

  it("round-trips the project through metadata", () => {
    const p = sample();
    const s = buildStencil(p, generateMandala(p));
    const { svg } = exportSVG(p, s.final);
    const back = normalizeProject(projectFromSVG(svg));
    expect(back.name).toBe("Test Mandala");
    expect(back.rings).toHaveLength(2);
    expect(back.rings[0]!.motif).toBe("petal");
  });

  it("formats numbers compactly", () => {
    expect(formatNumber(1.5, 3)).toBe("1.5");
    expect(formatNumber(2, 3)).toBe("2");
    expect(formatNumber(-0.0001, 3)).toBe("0");
    expect(formatNumber(12.34567, 3)).toBe("12.346");
  });
});
