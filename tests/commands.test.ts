import { describe, expect, it } from "vitest";
import "../src/geometry/motifs";
import { duplicateElements, makeCompound, removeElements, ungroupCompound } from "../src/editor/commands";
import { EditorStore, selectedItems, selectionOf } from "../src/editor/store";
import { actionGroupSelected, actionSelectAll, actionUngroupSelected } from "../src/editor/actions";
import { defaultRing, emptyProject, newElement, type SectorElement } from "../src/model/project";
import { elementTransform, applyElementTransform } from "../src/geometry/elements/sector";

function project() {
  const p = emptyProject("multi");
  p.rings = [
    defaultRing({ id: "r1", radius: 30, repeat: 8, elements: [newElement("teardrop", { id: "a", name: "a", x: 0, y: 0, length: 10, width: 5 }), newElement("dot", { id: "b", name: "b", x: 4, y: 6, length: 2, width: 2 }), newElement("leaf", { id: "c", name: "c", x: -3, y: -5, rotation: 30, length: 8, width: 4, children: [newElement("dot", { id: "c1", length: 1.5, width: 1.5 })] })] }),
    defaultRing({ id: "r2", radius: 50, repeat: 8, elements: [newElement("dot", { id: "d", name: "d", length: 2, width: 2 })] }),
  ];
  return p;
}

describe("multi-selection", () => {
  it("selectionOf collapses 0 / 1 / n items and toggleSelect adds and removes", () => {
    expect(selectionOf([]).kind).toBe("project");
    expect(selectionOf([{ ringId: "r1", elementId: "a" }])).toEqual({ kind: "element", ringId: "r1", elementId: "a" });
    const multi = selectionOf([{ ringId: "r1", elementId: "a" }, { ringId: "r1", elementId: "b" }, { ringId: "r1", elementId: "a" }]);
    expect(multi.kind).toBe("multi");
    expect(selectedItems(multi).length).toBe(2);
    const store = new EditorStore(project());
    store.select({ kind: "element", ringId: "r1", elementId: "a" });
    store.toggleSelect("r1", "b");
    expect(store.getState().selection.kind).toBe("multi");
    store.toggleSelect("r2", "d");
    expect(selectedItems(store.getState().selection).map((i) => i.elementId)).toEqual(["a", "b", "d"]);
    store.toggleSelect("r1", "b");
    store.toggleSelect("r1", "a");
    expect(store.getState().selection).toEqual({ kind: "element", ringId: "r2", elementId: "d" });
    // deleting a selected element drops it from the selection
    store.selectMany([{ ringId: "r1", elementId: "a" }, { ringId: "r1", elementId: "b" }]);
    store.execute(removeElements([{ ringId: "r1", elementId: "a" }]));
    expect(store.getState().selection).toEqual({ kind: "element", ringId: "r1", elementId: "b" });
  });

  it("removeElements / duplicateElements act on several elements in one undo step", () => {
    const store = new EditorStore(project());
    store.execute(duplicateElements([{ ringId: "r1", elementId: "a" }, { ringId: "r2", elementId: "d" }]));
    expect(store.getState().project.rings[0]!.elements.length).toBe(4);
    expect(store.getState().project.rings[1]!.elements.length).toBe(2);
    store.undo();
    expect(store.getState().project.rings[0]!.elements.length).toBe(3);
    store.execute(removeElements([{ ringId: "r1", elementId: "a" }, { ringId: "r1", elementId: "c1" }, { ringId: "r2", elementId: "d" }]));
    const p = store.getState().project;
    expect(p.rings[0]!.elements.map((e) => e.id)).toEqual(["b", "c"]);
    expect(p.rings[0]!.elements[1]!.children?.length).toBe(0);
    expect(p.rings[1]!.elements.length).toBe(0);
    store.undo();
    expect(store.getState().project.rings[0]!.elements.length).toBe(3);
  });

  it("actionSelectAll picks every top-level element of visible rings", () => {
    const p = project();
    p.rings[1]!.visible = false;
    const store = new EditorStore(p);
    actionSelectAll(store);
    expect(selectedItems(store.getState().selection).map((i) => i.elementId)).toEqual(["a", "b", "c"]);
  });
});

describe("group / ungroup", () => {
  it("grouping makes one compound element and ungrouping restores the members at the same world positions", () => {
    const store = new EditorStore(project());
    store.selectMany([{ ringId: "r1", elementId: "a" }, { ringId: "r1", elementId: "c" }]);
    const id = actionGroupSelected(store, "G");
    expect(id).toBeTruthy();
    let ring = store.getState().project.rings[0]!;
    expect(ring.elements.map((e) => e.type)).toEqual(["compound", "dot"]);
    expect(store.getState().project.compounds.length).toBe(1);
    expect(store.getState().selection).toEqual({ kind: "element", ringId: "r1", elementId: id });
    // move / rotate / scale / mirror the group, then ungroup: members keep their world placement
    const group = ring.elements[0]!;
    const moved = { ...group, x: 12, y: -4, rotation: 40, scaleX: 1.5, scaleY: 1.5, mirror: true } as SectorElement;
    const comp = store.getState().project.compounds[0]!;
    const expectPos = (m: SectorElement): { x: number; y: number } => applyElementTransform({ x: m.x, y: m.y }, elementTransform(moved, 30));
    const expected = comp.elements.map((m) => ({ name: m.name, at: expectPos(m) }));
    const p2 = ungroupCompound("r1", group.id).apply({ ...store.getState().project, rings: store.getState().project.rings.map((r) => (r.id === "r1" ? { ...r, elements: [moved, ...r.elements.slice(1)] } : r)) });
    expect(p2.rings[0]!.elements.map((e) => e.name)).toEqual(["a", "c", "b"]);
    expect(p2.compounds.length).toBe(0);
    for (const ex of expected) {
      const got = p2.rings[0]!.elements.find((e) => e.name === ex.name)!;
      expect(got.x).toBeCloseTo(ex.at.x, 1);
      expect(got.y).toBeCloseTo(ex.at.y, 1);
      expect(got.scaleX).toBeCloseTo(1.5, 5);
      expect(got.mirror).toBe(true);
    }
    const c = p2.rings[0]!.elements.find((e) => e.name === "c")!;
    expect(c.rotation).toBeCloseTo(40 - 30, 5);
    expect(c.children?.length).toBe(1);
    // via the action: selection becomes the members
    actionUngroupSelected(store);
    ring = store.getState().project.rings[0]!;
    expect(ring.elements.length).toBe(3);
    expect(store.getState().selection.kind).toBe("multi");
  });

  it("refuses to group across rings or nested elements, and keeps a compound that is still referenced", () => {
    const store = new EditorStore(project());
    store.selectMany([{ ringId: "r1", elementId: "a" }, { ringId: "r2", elementId: "d" }]);
    expect(actionGroupSelected(store)).toBeNull();
    expect(store.getState().project.compounds.length).toBe(0);
    store.selectMany([{ ringId: "r1", elementId: "c1" }, { ringId: "r1", elementId: "a" }]);
    expect(actionGroupSelected(store)).toBeNull();
    // two references to the same compound: ungrouping one keeps the motif
    const p = makeCompound("r1", ["a", "b"], "G").apply(project());
    const g = p.rings[0]!.elements.find((e) => e.type === "compound")!;
    const p2 = { ...p, rings: p.rings.map((r) => (r.id === "r2" ? { ...r, elements: [...r.elements, { ...g, id: "g2" } as SectorElement] } : r)) };
    const p3 = ungroupCompound("r1", g.id).apply(p2);
    expect(p3.compounds.length).toBe(1);
    const p4 = ungroupCompound("r2", "g2").apply(p3);
    expect(p4.compounds.length).toBe(0);
  });
});
