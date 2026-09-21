import { describe, expect, it, beforeEach } from "vitest";
import "../src/geometry/motifs";
import { defaultRing, emptyProject, newElement, type CompoundMotif, type SectorElement } from "../src/model/project";
import { freshIds, normalizeLibraryItem, parseLibrary, partFromElement, partFromProject, partFromRing, referencedCompounds, serializeLibrary } from "../src/model/library";
import { insertPartElement, insertPartRing } from "../src/editor/commands";
import { addLibraryItems, getLibrary, removeLibraryItem, renameLibraryItem, resetLibraryCache, setLibrary } from "../src/editor/library-store";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";

function sampleProject() {
  const p = emptyProject("Lib Test");
  const inner: CompoundMotif = { id: "c-inner", name: "inner", elements: [newElement("dot", { length: 2, width: 2 })] };
  const outer: CompoundMotif = { id: "c-outer", name: "outer", elements: [newElement("teardrop", { length: 8, width: 4 }), newElement("compound", { ref: "c-inner", x: 6 })] };
  const unused: CompoundMotif = { id: "c-unused", name: "unused", elements: [newElement("dot")] };
  p.compounds = [inner, outer, unused];
  p.rings = [
    defaultRing({
      id: "r1",
      radius: 30,
      repeat: 8,
      elements: [
        newElement("leaf", { id: "leaf1", name: "big leaf", length: 14, width: 7, inset: 1.5, insetStem: 2, children: [newElement("compound", { id: "kid", ref: "c-outer", x: 1 })] }),
        newElement("dot", { id: "dot1", y: 6, length: 2, width: 2 }),
      ],
    }),
  ];
  return p;
}

describe("parts library model", () => {
  it("bundles the compounds an element references, recursively, and nothing else", () => {
    const p = sampleProject();
    const leaf = p.rings[0]!.elements[0]!;
    const part = partFromElement(leaf, p.compounds, "  My Leaf  ");
    expect(part.kind).toBe("element");
    expect(part.name).toBe("My Leaf");
    expect(part.compounds.map((c) => c.id).sort()).toEqual(["c-inner", "c-outer"]);
    expect(referencedCompounds([p.rings[0]!.elements[1]!], p.compounds)).toEqual([]);
    // the part is a deep copy
    part.data.length = 99;
    expect(leaf.length).toBe(14);
  });

  it("ring and project parts carry their data and fall back to sensible names", () => {
    const p = sampleProject();
    const ring = partFromRing(p.rings[0]!, p.compounds);
    expect(ring.name).toBe("Ring");
    expect(ring.compounds.length).toBe(2);
    const proj = partFromProject(p);
    expect(proj.name).toBe("Lib Test");
    expect(proj.data.rings.length).toBe(1);
  });

  it("freshIds renames every element, ring and compound id and keeps compound refs consistent", () => {
    const p = sampleProject();
    const part = partFromRing(p.rings[0]!, p.compounds, "r");
    const fresh = freshIds(part);
    if (fresh.kind !== "ring" || part.kind !== "ring") throw new Error("kind");
    expect(fresh.data.id).not.toBe(part.data.id);
    const ids = (list: readonly SectorElement[]): string[] => list.flatMap((e) => [e.id, ...(e.children ? ids(e.children) : [])]);
    const oldIds = new Set([...ids(part.data.elements), ...part.compounds.flatMap((c) => [c.id, ...ids(c.elements)])]);
    for (const id of [...ids(fresh.data.elements), ...fresh.compounds.flatMap((c) => [c.id, ...ids(c.elements)])]) expect(oldIds.has(id)).toBe(false);
    const compIds = new Set(fresh.compounds.map((c) => c.id));
    const refs = (list: readonly SectorElement[]): string[] => list.flatMap((e) => [...(e.type === "compound" ? [e.ref] : []), ...(e.children ? refs(e.children) : [])]);
    for (const ref of [...refs(fresh.data.elements), ...fresh.compounds.flatMap((c) => refs(c.elements))]) expect(compIds.has(ref)).toBe(true);
  });

  it("serialize → parse round-trips and drops garbage entries", () => {
    const p = sampleProject();
    const items = [partFromElement(p.rings[0]!.elements[0]!, p.compounds, "leaf"), partFromRing(p.rings[0]!, p.compounds, "ring"), partFromProject(p, "proj")];
    const text = serializeLibrary(items);
    const back = parseLibrary(text);
    expect(back.map((i) => [i.kind, i.name])).toEqual([
      ["element", "leaf"],
      ["ring", "ring"],
      ["project", "proj"],
    ]);
    expect(back[0]!.compounds.length).toBe(2);
    expect(parseLibrary(JSON.stringify([{ kind: "element", data: { type: "teardrop" } }, { kind: "bogus" }, 42, { kind: "ring", data: "x" }, { kind: "project", data: { rings: [] } }])).map((i) => i.kind)).toEqual(["element", "project"]);
    expect(() => parseLibrary("{not json")).toThrow();
    expect(() => parseLibrary('{"hello":1}')).toThrow();
    const repaired = normalizeLibraryItem({ kind: "element", name: "xy", data: { type: "nope", length: 5 } });
    expect(repaired?.kind === "element" ? repaired.data.type : null).toBe("teardrop");
    expect(normalizeLibraryItem({ kind: "element", name: "xy", data: {} })?.name).toBe("xy");
  });
});

describe("inserting parts into a project", () => {
  it("adds missing compounds once and the element into the ring; the result still builds", () => {
    const src = sampleProject();
    const part = freshIds(partFromElement(src.rings[0]!.elements[0]!, src.compounds, "leaf"));
    if (part.kind !== "element") throw new Error("kind");
    const target = emptyProject("target");
    target.rings = [defaultRing({ id: "t1", radius: 30, repeat: 8, elements: [] })];
    const once = insertPartElement("t1", part.data, part.compounds).apply(target);
    expect(once.compounds.map((c) => c.id).sort()).toEqual(part.compounds.map((c) => c.id).sort());
    expect(once.rings[0]!.elements.length).toBe(1);
    const again = freshIds(part);
    if (again.kind !== "element") throw new Error("kind");
    const twice = insertPartElement("t1", again.data, part.compounds).apply(once);
    expect(twice.compounds.length).toBe(2);
    expect(twice.rings[0]!.elements.length).toBe(2);
    const stencil = buildStencil(twice, generateMandala(twice));
    expect(stencil.final.length).toBeGreaterThan(0);
  });

  it("adds a ring part as a new ring with its compounds", () => {
    const src = sampleProject();
    const part = freshIds(partFromRing(src.rings[0]!, src.compounds, "ring"));
    if (part.kind !== "ring") throw new Error("kind");
    const target = emptyProject("target");
    const out = insertPartRing(part.data, part.compounds).apply(target);
    expect(out.rings.length).toBe(1);
    expect(out.rings[0]!.id).toBe(part.data.id);
    expect(out.compounds.length).toBe(2);
  });
});

describe("library store (in-memory fallback without localStorage)", () => {
  beforeEach(() => {
    resetLibraryCache();
    setLibrary([]);
  });

  it("adds newest first, renames, removes, and de-duplicates ids", () => {
    const p = sampleProject();
    const a = partFromElement(p.rings[0]!.elements[1]!, p.compounds, "a");
    const b = partFromElement(p.rings[0]!.elements[1]!, p.compounds, "b");
    addLibraryItems([a]);
    addLibraryItems([b]);
    expect(getLibrary().map((i) => i.name)).toEqual(["b", "a"]);
    addLibraryItems([{ ...a, name: "a2" }]);
    expect(getLibrary().length).toBe(3);
    expect(new Set(getLibrary().map((i) => i.id)).size).toBe(3);
    renameLibraryItem(b.id, "  renamed ");
    expect(getLibrary().find((i) => i.id === b.id)?.name).toBe("renamed");
    removeLibraryItem(a.id);
    expect(getLibrary().some((i) => i.id === a.id)).toBe(false);
  });
});

describe("registering several elements as one part", () => {
  it("bundles the selection into a compound part that inserts as a group at the same relative layout", async () => {
    const { partFromElements } = await import("../src/model/library");
    const { EditorStore } = await import("../src/editor/store");
    const { actionSavePart, actionInsertPart } = await import("../src/editor/actions");
    const p = sampleProject();
    const ring = p.rings[0]!;
    const part = partFromElements(ring.elements, p.compounds, "Pair");
    expect(part.kind).toBe("element");
    expect(part.data.type).toBe("compound");
    const group = part.compounds.find((c) => c.id === (part.data as { ref: string }).ref)!;
    expect(group.elements.length).toBe(2);
    // centroid of (0,0) and (0,6) → group at (0,3); members at ±3
    expect(part.data.y).toBe(3);
    expect(group.elements.map((e) => e.y).sort()).toEqual([-3, 3]);
    // the leaf's own compound reference is bundled too
    expect(part.compounds.map((c) => c.id)).toEqual(expect.arrayContaining(["c-inner", "c-outer"]));
    // via the action on a multi selection, then insert into an empty project
    setLibrary([]);
    const store = new EditorStore(p);
    store.selectMany(ring.elements.map((e) => ({ ringId: ring.id, elementId: e.id })));
    const saved = actionSavePart(store, "Pair");
    expect(saved?.kind).toBe("element");
    expect(getLibrary().length).toBe(1);
    const target = new EditorStore(emptyProject("t"));
    actionInsertPart(target, saved!);
    const tp = target.getState().project;
    expect(tp.rings.length).toBe(1);
    expect(tp.rings[0]!.elements[0]!.type).toBe("compound");
    expect(tp.compounds.length).toBe(3);
    const stencil = buildStencil(tp, generateMandala(tp));
    expect(stencil.final.length).toBeGreaterThan(0);
    // across rings the action refuses
    store.selectMany([{ ringId: "r1", elementId: "leaf1" }, { ringId: "r1", elementId: "dot1" }]);
    expect(actionSavePart(store, "x")).not.toBeNull();
  });
});
