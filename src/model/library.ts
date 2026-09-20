/**
 * User parts library ("マイパーツ"): reusable elements, rings (sector designs) and
 * whole projects saved by the user. Pure TS, no DOM. Stored as JSON in the browser
 * and exchangeable as a `.parts.json` file.
 */
import { newId, type CompoundMotif, type Project, type Ring, type SectorElement } from "./project";
import { normalizeCompound, normalizeElement, normalizeProject, normalizeRing } from "./validate";

export type PartKind = "element" | "ring" | "project";

export interface LibraryItemBase {
  id: string;
  name: string;
  /** ISO date string. */
  createdAt: string;
  /** Compound motifs referenced by the part (bundled so it works in any project). */
  compounds: CompoundMotif[];
}
export interface ElementPart extends LibraryItemBase {
  kind: "element";
  data: SectorElement;
}
export interface RingPart extends LibraryItemBase {
  kind: "ring";
  data: Ring;
}
export interface ProjectPart extends LibraryItemBase {
  kind: "project";
  data: Project;
}
export type LibraryItem = ElementPart | RingPart | ProjectPart;

export const LIBRARY_FORMAT = "mandalafab-parts";
export const LIBRARY_VERSION = 1;
export const LIBRARY_LIMIT = 500;

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: typeof LIBRARY_VERSION;
  items: LibraryItem[];
}

export const PART_KIND_LABEL: Record<PartKind, string> = { element: "要素", ring: "リング", project: "プロジェクト" };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const CONTROL_RE = /[\x00-\x1f\x7f]/g;
const cleanName = (v: unknown, fallback: string): string => {
  const s = typeof v === "string" ? v.replace(CONTROL_RE, "").trim().slice(0, 60) : "";
  return s.length > 0 ? s : fallback;
};

/** Compound motifs used by `elements` (nested children and compounds-inside-compounds included). */
export function referencedCompounds(elements: readonly SectorElement[], compounds: readonly CompoundMotif[]): CompoundMotif[] {
  const out: CompoundMotif[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly SectorElement[], depth: number): void => {
    if (depth > 4) return;
    for (const e of list) {
      if (e.type === "compound" && !seen.has(e.ref)) {
        const c = compounds.find((x) => x.id === e.ref);
        if (c) {
          seen.add(c.id);
          out.push(c);
          walk(c.elements, depth + 1);
        }
      }
      if (e.children && e.children.length > 0) walk(e.children, depth + 1);
    }
  };
  walk(elements, 0);
  return out;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const now = (): string => new Date().toISOString();

export function partFromElement(el: SectorElement, compounds: readonly CompoundMotif[], name?: string): ElementPart {
  return { id: newId("p"), kind: "element", name: cleanName(name, el.name ?? el.type), createdAt: now(), compounds: clone(referencedCompounds([el], compounds)), data: clone(el) };
}

export function partFromRing(ring: Ring, compounds: readonly CompoundMotif[], name?: string): RingPart {
  return { id: newId("p"), kind: "ring", name: cleanName(name, ring.name), createdAt: now(), compounds: clone(referencedCompounds(ring.elements, compounds)), data: clone(ring) };
}

export function partFromProject(project: Project, name?: string): ProjectPart {
  return { id: newId("p"), kind: "project", name: cleanName(name, project.name), createdAt: now(), compounds: [], data: clone(project) };
}

/**
 * Copy of the part with new element / ring / compound ids, so inserting the same
 * part twice (or into a project that already has those ids) never collides.
 * Compound refs are remapped consistently.
 */
export function freshIds(item: LibraryItem): LibraryItem {
  const compMap = new Map<string, string>();
  for (const c of item.compounds) compMap.set(c.id, newId("c"));
  const remapElement = (e: SectorElement): SectorElement => {
    const copy = { ...clone(e), id: newId("e") } as SectorElement;
    if (copy.type === "compound" && compMap.has(copy.ref)) copy.ref = compMap.get(copy.ref)!;
    if (copy.children && copy.children.length > 0) copy.children = copy.children.map(remapElement);
    return copy;
  };
  const compounds = item.compounds.map((c) => ({ id: compMap.get(c.id) ?? c.id, name: c.name, elements: c.elements.map(remapElement) }));
  if (item.kind === "element") return { ...item, compounds, data: remapElement(item.data) };
  if (item.kind === "ring") return { ...item, compounds, data: { ...clone(item.data), id: newId("r"), elements: item.data.elements.map(remapElement) } };
  return { ...item, compounds, data: clone(item.data) };
}

/** Validate one untrusted library item. Returns null when it cannot be repaired. */
export function normalizeLibraryItem(raw: unknown): LibraryItem | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (kind !== "element" && kind !== "ring" && kind !== "project") return null;
  const base = {
    id: typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : newId("p"),
    createdAt: typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : now(),
    compounds: (Array.isArray(raw.compounds) ? raw.compounds.slice(0, 64) : []).map(normalizeCompound).filter((c): c is CompoundMotif => c !== null),
  };
  if (kind === "element") {
    const data = normalizeElement(raw.data);
    if (!data) return null;
    return { ...base, kind, name: cleanName(raw.name, data.name ?? data.type), data };
  }
  if (kind === "ring") {
    if (!isRecord(raw.data)) return null;
    const data = normalizeRing(raw.data, 0);
    return { ...base, kind, name: cleanName(raw.name, data.name), data };
  }
  if (!isRecord(raw.data) || !Array.isArray(raw.data.rings)) return null;
  const data = normalizeProject(raw.data);
  return { ...base, kind, name: cleanName(raw.name, data.name), data };
}

/** Accepts a library file, a bare array of items, or a single item. Invalid entries are skipped. */
export function parseLibrary(text: string): LibraryItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み込めませんでした。");
  }
  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw) && Array.isArray(raw.items)) list = raw.items;
  else if (isRecord(raw) && typeof raw.kind === "string") list = [raw];
  else throw new Error("MandalaFab のパーツファイルではありません。");
  return list.slice(0, LIBRARY_LIMIT).map(normalizeLibraryItem).filter((x): x is LibraryItem => x !== null);
}

export function serializeLibrary(items: readonly LibraryItem[]): string {
  const file: LibraryFile = { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, items: items.slice() };
  return JSON.stringify(file, null, 2);
}
