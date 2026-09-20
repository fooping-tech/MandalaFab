/**
 * Commands are pure functions Project -> Project. The store records the previous
 * project for undo. `coalesceKey` merges rapid consecutive edits (slider drags).
 */
import {
  defaultRing,
  newElement,
  newId,
  type BridgeSettings,
  type CenterMotif,
  type CompoundMotif,
  type Constraints,
  type ElementType,
  type Project,
  type Ring,
  type SectorElement,
  type Sheet,
} from "../model/project";

export interface Command {
  label: string;
  coalesceKey?: string;
  apply(project: Project): Project;
}

const keys = (o: object): string => Object.keys(o).join(",");

function mapRing(p: Project, id: string, fn: (r: Ring) => Ring): Project {
  const i = p.rings.findIndex((r) => r.id === id);
  if (i < 0) return p;
  const rings = p.rings.slice();
  rings[i] = fn(rings[i]!);
  return { ...p, rings };
}

/** Map over an element list recursively (nested children included). */
function mapDeep(list: SectorElement[], elementId: string, fn: (e: SectorElement) => SectorElement): SectorElement[] {
  let changed = false;
  const out = list.map((e) => {
    if (e.id === elementId) {
      changed = true;
      return fn(e);
    }
    if (e.children && e.children.length > 0) {
      const children = mapDeep(e.children, elementId, fn);
      if (children !== e.children) {
        changed = true;
        return { ...e, children } as SectorElement;
      }
    }
    return e;
  });
  return changed ? out : list;
}

function mapElement(p: Project, ringId: string, elementId: string, fn: (e: SectorElement) => SectorElement): Project {
  return mapRing(p, ringId, (r) => {
    const elements = mapDeep(r.elements, elementId, fn);
    return elements === r.elements ? r : { ...r, elements };
  });
}

/** Find an element (top-level or nested) in a ring. */
export function findElementDeep(list: readonly SectorElement[], elementId: string): SectorElement | undefined {
  for (const e of list) {
    if (e.id === elementId) return e;
    if (e.children) {
      const f = findElementDeep(e.children, elementId);
      if (f) return f;
    }
  }
  return undefined;
}

/** Add a nested child to an element. */
export const addChild = (ringId: string, parentId: string, child: SectorElement): Command => ({
  label: "内部モチーフを追加",
  apply: (p) => mapElement(p, ringId, parentId, (e) => ({ ...e, children: [...(e.children ?? []), child] }) as SectorElement),
});

/** Remove a nested child by id. */
export const removeChild = (ringId: string, childId: string): Command => ({
  label: "内部モチーフを削除",
  apply: (p) =>
    mapRing(p, ringId, (r) => {
      const strip = (list: SectorElement[]): SectorElement[] => list.map((e) => (e.children ? ({ ...e, children: strip(e.children.filter((c) => c.id !== childId)) } as SectorElement) : e));
      return { ...r, elements: strip(r.elements) };
    }),
});

// ---- rings -----------------------------------------------------------------

export const updateRing = (id: string, patch: Partial<Ring>, label = "リングを編集"): Command => ({
  label,
  coalesceKey: `ring:${id}:${keys(patch)}`,
  apply: (p) => mapRing(p, id, (r) => ({ ...r, ...patch })),
});

export const addRing = (ring: Ring, index?: number): Command => ({
  label: "リングを追加",
  apply: (p) => {
    const rings = p.rings.slice();
    rings.splice(index ?? rings.length, 0, ring);
    return { ...p, rings };
  },
});

/** A new ring placed outside the current outermost ring, seeded with a teardrop. */
export function nextRing(project: Project): Ring {
  const outer = project.rings.reduce((m, r) => Math.max(m, r.radius + 10), project.center.type === "none" ? 8 : project.center.outerRadius + 4);
  const limit = Math.min(project.sheet.width, project.sheet.height) / 2 - 6;
  const radius = Math.max(8, Math.min(limit - 6, outer + 10));
  const repeat = project.symmetry;
  const W = 2 * Math.PI * radius * (1 / repeat);
  const L = Math.min(16, Math.max(6, limit - radius));
  return defaultRing({
    name: `Ring ${project.rings.length + 1}`,
    radius: Math.round(radius),
    repeat,
    elements: [newElement("teardrop", { name: "teardrop", length: Math.round(L), width: Math.round(Math.min(W * 0.35, L * 0.5) * 2) / 2 })],
  });
}

export const removeRing = (id: string): Command => ({ label: "リングを削除", apply: (p) => ({ ...p, rings: p.rings.filter((r) => r.id !== id) }) });

function cloneElement(e: SectorElement, suffix = ""): SectorElement {
  const copy = { ...e, id: newId("e"), params: { ...e.params } } as SectorElement;
  if (suffix) copy.name = `${e.name ?? e.type}${suffix}`;
  if (copy.type === "bezier") copy.points = copy.points.map((p) => ({ ...p }));
  if (copy.type === "connector") {
    copy.from = { ...copy.from };
    copy.to = { ...copy.to };
  }
  return copy;
}

export const duplicateRing = (id: string): Command => ({
  label: "リングを複製",
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const src = p.rings[i]!;
    const copy: Ring = { ...src, id: newId("r"), name: `${src.name} copy`, elements: src.elements.map((e) => cloneElement(e)) };
    const rings = p.rings.slice();
    rings.splice(i + 1, 0, copy);
    return { ...p, rings };
  },
});

export const moveRing = (id: string, delta: -1 | 1): Command => ({
  label: "リングの順序を変更",
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= p.rings.length) return p;
    const rings = p.rings.slice();
    [rings[i], rings[j]] = [rings[j]!, rings[i]!];
    return { ...p, rings };
  },
});

// ---- elements --------------------------------------------------------------

export const updateElement = (ringId: string, elementId: string, patch: Partial<SectorElement>, label = "要素を編集"): Command => ({
  label,
  coalesceKey: `el:${ringId}:${elementId}:${keys(patch)}`,
  apply: (p) => mapElement(p, ringId, elementId, (e) => ({ ...e, ...patch }) as SectorElement),
});

export const updateElementParam = (ringId: string, elementId: string, key: string, value: number): Command => ({
  label: "要素のパラメータを編集",
  coalesceKey: `el:${ringId}:${elementId}:param:${key}`,
  apply: (p) => mapElement(p, ringId, elementId, (e) => ({ ...e, params: { ...e.params, [key]: value } }) as SectorElement),
});

/** Change an element's type, keeping shared fields. */
export const setElementType = (ringId: string, elementId: string, type: ElementType): Command => ({
  label: "要素の種類を変更",
  apply: (p) =>
    mapElement(p, ringId, elementId, (e) => {
      const fresh = newElement(type);
      const keep = { id: e.id, name: e.name, visible: e.visible, x: e.x, y: e.y, rotation: e.rotation, scaleX: e.scaleX, scaleY: e.scaleY, mirror: e.mirror, length: e.length, width: e.width, mode: e.mode, orient: e.orient, repeat: e.repeat, repeatSpread: e.repeatSpread, inset: e.inset, insetStem: e.insetStem };
      const out = { ...fresh, ...keep, strokeWidth: fresh.strokeWidth > 0 && e.strokeWidth === 0 ? fresh.strokeWidth : e.strokeWidth } as SectorElement;
      if (out.name === undefined) delete (out as { name?: string }).name;
      return out;
    }),
});

export const addElement = (ringId: string, element: SectorElement, index?: number): Command => ({
  label: "要素を追加",
  apply: (p) =>
    mapRing(p, ringId, (r) => {
      const elements = r.elements.slice();
      elements.splice(index ?? elements.length, 0, element);
      return { ...r, elements };
    }),
});

export const removeElement = (ringId: string, elementId: string): Command => ({
  label: "要素を削除",
  apply: (p) =>
    mapRing(p, ringId, (r) => {
      if (r.elements.some((e) => e.id === elementId)) return { ...r, elements: r.elements.filter((e) => e.id !== elementId) };
      return removeChild(ringId, elementId).apply(p).rings.find((x) => x.id === r.id) ?? r;
    }),
});

export const duplicateElement = (ringId: string, elementId: string): Command => ({
  label: "要素を複製",
  apply: (p) =>
    mapRing(p, ringId, (r) => {
      const i = r.elements.findIndex((e) => e.id === elementId);
      if (i < 0) return r;
      const elements = r.elements.slice();
      elements.splice(i + 1, 0, cloneElement(r.elements[i]!, " copy"));
      return { ...r, elements };
    }),
});

export const moveElement = (ringId: string, elementId: string, delta: -1 | 1): Command => ({
  label: "要素の順序を変更",
  apply: (p) =>
    mapRing(p, ringId, (r) => {
      const i = r.elements.findIndex((e) => e.id === elementId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= r.elements.length) return r;
      const elements = r.elements.slice();
      [elements[i], elements[j]] = [elements[j]!, elements[i]!];
      return { ...r, elements };
    }),
});

/** Move a bezier control point (index into element.points). */
export const setBezierPoint = (ringId: string, elementId: string, index: number, point: { x: number; y: number }): Command => ({
  label: "制御点を移動",
  coalesceKey: `el:${ringId}:${elementId}:pt:${index}`,
  apply: (p) =>
    mapElement(p, ringId, elementId, (e) => {
      if (e.type !== "bezier") return e;
      const points = e.points.slice();
      points[index] = { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
      return { ...e, points };
    }),
});

export const addBezierSegment = (ringId: string, elementId: string): Command => ({
  label: "セグメントを追加",
  apply: (p) =>
    mapElement(p, ringId, elementId, (e) => {
      if (e.type !== "bezier") return e;
      const last = e.points[e.points.length - 1]!;
      const prev = e.points[e.points.length - 2]!;
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = (dx / len) * 4;
      const uy = (dy / len) * 4;
      return { ...e, points: [...e.points, { x: last.x + ux, y: last.y + uy }, { x: last.x + 2 * ux, y: last.y + 2 * uy }, { x: last.x + 3 * ux, y: last.y + 3 * uy }] };
    }),
});

export const removeBezierSegment = (ringId: string, elementId: string): Command => ({
  label: "セグメントを削除",
  apply: (p) => mapElement(p, ringId, elementId, (e) => (e.type !== "bezier" || e.points.length <= 4 ? e : { ...e, points: e.points.slice(0, -3) })),
});

/** Turn the selected element into a reusable compound motif and replace it with a reference. */
export const makeCompound = (ringId: string, elementIds: string[], name: string): Command => ({
  label: "複合モチーフを作成",
  apply: (p) => {
    const ring = p.rings.find((r) => r.id === ringId);
    if (!ring) return p;
    const picked = ring.elements.filter((e) => elementIds.includes(e.id));
    if (picked.length === 0) return p;
    const cx = picked.reduce((s, e) => s + e.x, 0) / picked.length;
    const cy = picked.reduce((s, e) => s + e.y, 0) / picked.length;
    const compound: CompoundMotif = { id: newId("c"), name, elements: picked.map((e) => ({ ...cloneElement(e), x: e.x - cx, y: e.y - cy }) as SectorElement) };
    const ref = newElement("compound", { name, ref: compound.id, x: cx, y: cy });
    const firstIndex = ring.elements.findIndex((e) => elementIds.includes(e.id));
    const elements = ring.elements.filter((e) => !elementIds.includes(e.id));
    elements.splice(firstIndex, 0, ref);
    return { ...p, compounds: [...p.compounds, compound], rings: p.rings.map((r) => (r.id === ringId ? { ...r, elements } : r)) };
  },
});

// ---- center / project ------------------------------------------------------

export const updateCenter = (patch: Partial<CenterMotif>): Command => ({
  label: "中心モチーフ",
  coalesceKey: `center:${keys(patch)}`,
  apply: (p) => ({ ...p, center: { ...p.center, ...patch } }),
});

export const replaceProject = (project: Project, label = "プロジェクトを読み込み"): Command => ({ label, apply: () => project });

// ---- user parts ------------------------------------------------------------

/** Add compounds the project does not have yet (matched by id). */
function mergeCompounds(current: CompoundMotif[], added: readonly CompoundMotif[]): CompoundMotif[] {
  const missing = added.filter((c) => !current.some((x) => x.id === c.id));
  return missing.length === 0 ? current : [...current, ...missing];
}

/** Insert a saved element part (plus the compounds it needs) into a ring. */
export const insertPartElement = (ringId: string, element: SectorElement, compounds: readonly CompoundMotif[]): Command => ({
  label: "パーツを挿入",
  apply: (p) => addElement(ringId, element).apply({ ...p, compounds: mergeCompounds(p.compounds, compounds) }),
});

/** Insert a saved ring part (plus the compounds it needs) as a new ring. */
export const insertPartRing = (ring: Ring, compounds: readonly CompoundMotif[], index?: number): Command => ({
  label: "リングのパーツを追加",
  apply: (p) => addRing(ring, index).apply({ ...p, compounds: mergeCompounds(p.compounds, compounds) }),
});

export const updateProject = (patch: Partial<Pick<Project, "name" | "symmetry" | "seed" | "generator">>, label = "プロジェクト設定"): Command => ({
  label,
  coalesceKey: `project:${keys(patch)}`,
  apply: (p) => ({ ...p, ...patch }),
});

export const updateSheet = (patch: Partial<Sheet>): Command => ({ label: "シート設定", coalesceKey: `sheet:${keys(patch)}`, apply: (p) => ({ ...p, sheet: { ...p.sheet, ...patch } }) });
export const updateConstraints = (patch: Partial<Constraints>): Command => ({ label: "加工制約", coalesceKey: `constraints:${keys(patch)}`, apply: (p) => ({ ...p, constraints: { ...p.constraints, ...patch } }) });
export const updateBridges = (patch: Partial<BridgeSettings>): Command => ({ label: "ブリッジ設定", coalesceKey: `bridges:${keys(patch)}`, apply: (p) => ({ ...p, bridges: { ...p.bridges, ...patch } }) });

/** Change symmetry; rings whose repeat was a multiple of the old symmetry follow. */
export const setSymmetry = (symmetry: number, rescale: boolean): Command => ({
  label: "対称数を変更",
  apply: (p) => {
    if (!rescale || p.symmetry === symmetry) return { ...p, symmetry };
    const rings = p.rings.map((r) => (r.repeat % p.symmetry === 0 ? { ...r, repeat: Math.max(1, Math.round((r.repeat / p.symmetry) * symmetry)) } : r));
    const center = p.center.petals % p.symmetry === 0 ? { ...p.center, petals: Math.max(3, Math.round((p.center.petals / p.symmetry) * symmetry)) } : p.center;
    return { ...p, symmetry, rings, center };
  },
});
