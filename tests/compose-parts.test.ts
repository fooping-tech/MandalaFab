import { describe, expect, it } from "vitest";
import "../src/geometry/motifs";
import { composeMandala, compositionStats, type PartCandidate } from "../src/generate/compose";
import { generateProject, partsSettingsFor } from "../src/generate/generator";
import { partFromElement, type ElementPart } from "../src/model/library";
import { emptyProject, newElement, type CompoundMotif, type SectorElement } from "../src/model/project";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";

const base = { sheet: { width: 200, height: 200, outline: false, cornerRadius: 0 } };

function walk(list: readonly SectorElement[], fn: (e: SectorElement) => void): void {
  for (const e of list) {
    fn(e);
    if (e.children) walk(e.children, fn);
  }
}

function strip(p: ReturnType<typeof composeMandala>): unknown {
  return JSON.parse(JSON.stringify(p, (k, v) => (k === "id" || k === "ref" ? undefined : v)));
}

function parts(): { leaf: ElementPart; star: ElementPart; withCompound: ElementPart } {
  const p = emptyProject("src");
  const comp: CompoundMotif = { id: "c-eyes", name: "eyes", elements: [newElement("dot", { x: -2, length: 1.8, width: 1.8 }), newElement("dot", { x: 2, length: 1.8, width: 1.8 })] };
  p.compounds = [comp];
  const leaf = newElement("leaf", { name: "user leaf", length: 12, width: 6, inset: 1.4, insetStem: 1.8, params: { tipSharpness: 0.85, bend: 0.2 }, children: [newElement("dot", { length: 2, width: 2 })] });
  const star = newElement("shape", { name: "user star", motif: "star", length: 8, width: 8, params: { points: 5, inner: 0.5 } });
  const withCompound = newElement("teardrop", { name: "user drop", length: 10, width: 5, inset: 1.3, insetStem: 1.6, children: [newElement("compound", { ref: "c-eyes", x: 0 })] });
  return { leaf: partFromElement(leaf, p.compounds, "user leaf"), star: partFromElement(star, p.compounds, "user star"), withCompound: partFromElement(withCompound, p.compounds, "user drop") };
}

describe("user parts in the composition engine", () => {
  it("frequency 0 (or no parts) leaves the composition exactly as before", () => {
    const { leaf } = parts();
    const plain = composeMandala({ symmetry: 12, density: 0.7, seed: 21 }, base);
    const off = generateProject({ symmetry: 12, density: 0.7, seed: 21, partsFrequency: 0, partWeights: { [leaf.id]: 2 } }, base, [leaf]);
    const zeroWeight = generateProject({ symmetry: 12, density: 0.7, seed: 21, partsFrequency: 1, partWeights: { [leaf.id]: 0 } }, base, [leaf]);
    expect(strip(off)).toEqual(strip(plain));
    expect(strip(zeroWeight)).toEqual(strip(plain));
    expect(partsSettingsFor({ symmetry: 12, density: 0.7, seed: 1, partsFrequency: 0.5 }, [])).toBeUndefined();
  });

  it("frequency 1 uses the parts as primary / secondary / filler and records the settings in the project", () => {
    const { leaf, star } = parts();
    const p = generateProject({ symmetry: 12, density: 0.8, seed: 5, partsFrequency: 1, partWeights: { [leaf.id]: 1, [star.id]: 1 } }, base, [leaf, star]);
    const roles = new Set<string>();
    let count = 0;
    for (const r of p.rings) walk(r.elements, (e) => { if (e.name === "user leaf" || e.name === "user star") { count++; if (e.role) roles.add(e.role); } });
    expect(count).toBeGreaterThanOrEqual(6);
    expect(roles.has("primary")).toBe(true);
    expect(roles.has("secondary") || roles.has("filler")).toBe(true);
    // nested child of the leaf part survives and the part keeps its inset border
    let nested = 0;
    for (const r of p.rings) walk(r.elements, (e) => { if (e.name === "user leaf" && e.children && e.children.length === 1 && e.inset > 0) nested++; });
    expect(nested).toBeGreaterThan(0);
    expect(p.generator?.partsFrequency).toBe(1);
    expect(p.generator?.partWeights?.[leaf.id]).toBe(1);
    // still a manufacturable composition: every band has a primary and the stencil builds
    for (const r of p.rings) expect(compositionStats(r).byRole.primary).toBeGreaterThanOrEqual(1);
    const s = buildStencil(p, generateMandala(p));
    expect(s.final.length).toBeGreaterThan(0);
    expect(s.islands.length).toBe(0);
  });

  it("weights bias the pick: a heavy part appears more often than a light one", () => {
    const { leaf, star } = parts();
    const tally = (heavy: ElementPart, light: ElementPart): [number, number] => {
      let h = 0, l = 0;
      for (const seed of [1, 2, 3]) {
        const p = generateProject({ symmetry: 12, density: 0.8, seed, partsFrequency: 1, partWeights: { [heavy.id]: 4, [light.id]: 0.25 } }, base, [heavy, light]);
        for (const r of p.rings) walk(r.elements, (e) => { if (e.name === heavy.name) h++; else if (e.name === light.name) l++; });
      }
      return [h, l];
    };
    const [h, l] = tally(leaf, star);
    expect(h).toBeGreaterThan(l);
  });

  it("parts that reference compounds bring their compounds along and resolve", () => {
    const { withCompound } = parts();
    expect(withCompound.compounds.map((c) => c.id)).toEqual(["c-eyes"]);
    const p = generateProject({ symmetry: 10, density: 0.7, seed: 9, partsFrequency: 1 }, base, [withCompound]);
    expect(p.compounds.some((c) => c.id === "c-eyes")).toBe(true);
    let refs = 0;
    for (const r of p.rings) walk(r.elements, (e) => { if (e.type === "compound" && e.ref === "c-eyes") refs++; });
    expect(refs).toBeGreaterThan(0);
    const geom = generateMandala(p);
    expect(geom.rings.length).toBe(p.rings.length);
  });

  it("frequency scales usage: 0.3 uses fewer parts than 1.0", () => {
    const { leaf } = parts();
    const countFor = (f: number): number => {
      let n = 0;
      for (const seed of [4, 5]) {
        const p = generateProject({ symmetry: 12, density: 0.8, seed, partsFrequency: f }, base, [leaf]);
        for (const r of p.rings) walk(r.elements, (e) => { if (e.name === "user leaf") n++; });
      }
      return n;
    };
    const low = countFor(0.3);
    const high = countFor(1);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it("candidate list type is exported for callers", () => {
    const c: PartCandidate = { id: "x", name: "x", element: newElement("dot"), compounds: [], weight: 1 };
    expect(c.weight).toBe(1);
  });
});
