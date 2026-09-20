import { hasMotif } from "../geometry/motifs/registry";
import type { Vec2 } from "../geometry/types";
import {
  APP_VERSION,
  DEFAULT_BRIDGES,
  DEFAULT_CENTER,
  DEFAULT_CONSTRAINTS,
  DEFAULT_SHEET,
  ELEMENT_TYPES,
  LIMITS,
  PROJECT_VERSION,
  elementDefaults,
  newId,
  type BridgeSettings,
  type CenterMotif,
  type CompoundMotif,
  type Constraints,
  type ElementType,
  type ManualBridge,
  type Project,
  type Ring,
  type SectorElement,
  type Sheet,
} from "./project";

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return clamp(n, min, max);
}

function str(value: unknown, fallback: string, max = 100): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;
const id = (v: unknown, prefix: string): string => (typeof v === "string" && ID_RE.test(v) ? v : newId(prefix));

function vec(v: unknown, fallback: Vec2): Vec2 {
  if (!isRecord(v)) return fallback;
  return { x: num(v.x, fallback.x, -1000, 1000), y: num(v.y, fallback.y, -1000, 1000) };
}

function params(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(v)) return out;
  for (const [k, val] of Object.entries(v)) if (typeof val === "number" && Number.isFinite(val) && /^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/.test(k)) out[k] = clamp(val, -1e4, 1e4);
  return out;
}

const TYPES = new Set<string>(ELEMENT_TYPES.map((t) => t.type));

const ROLES = new Set(["primary", "secondary", "flow", "filler", "boundary"]);

export function normalizeElement(raw: unknown, depth = 0): SectorElement | null {
  if (!isRecord(raw)) return null;
  const type = (typeof raw.type === "string" && TYPES.has(raw.type) ? raw.type : "teardrop") as ElementType;
  const d = elementDefaults();
  const base = {
    id: id(raw.id, "e"),
    type,
    visible: raw.visible !== false,
    x: num(raw.x, 0, LIMITS.position.min, LIMITS.position.max),
    y: num(raw.y, 0, LIMITS.position.min, LIMITS.position.max),
    rotation: num(raw.rotation, 0, -360, 360),
    scaleX: num(raw.scaleX, 1, LIMITS.scale.min, LIMITS.scale.max),
    scaleY: num(raw.scaleY, 1, LIMITS.scale.min, LIMITS.scale.max),
    mirror: raw.mirror === true,
    length: num(raw.length, d.length, LIMITS.length.min, LIMITS.length.max),
    width: num(raw.width, d.width, LIMITS.width.min, LIMITS.width.max),
    strokeWidth: num(raw.strokeWidth, 0, LIMITS.strokeWidth.min, LIMITS.strokeWidth.max),
    mode: raw.mode === "keep" ? ("keep" as const) : ("cut" as const),
    orient: raw.orient === "radial" ? ("radial" as const) : ("sector" as const),
    repeat: Math.round(num(raw.repeat, 1, 1, 64)),
    repeatSpread: num(raw.repeatSpread, 0, 0, 360),
    inset: num(raw.inset, 0, LIMITS.inset.min, LIMITS.inset.max),
    insetStem: num(raw.insetStem, 0, 0, 20),
    params: params(raw.params),
  };
  if (typeof raw.name === "string") (base as { name?: string }).name = raw.name.slice(0, 60);
  if (typeof raw.role === "string" && ROLES.has(raw.role)) (base as { role?: string }).role = raw.role;
  if (Array.isArray(raw.children) && raw.children.length > 0 && depth < 3) {
    const children = raw.children
      .slice(0, 32)
      .map((c) => normalizeElement(c, depth + 1))
      .filter((c): c is SectorElement => c !== null);
    if (children.length > 0) (base as { children?: SectorElement[] }).children = children;
  }
  switch (type) {
    case "bezier": {
      const pts = Array.isArray(raw.points) ? raw.points.map((p) => vec(p, { x: 0, y: 0 })) : [];
      const n = Math.max(0, Math.floor((pts.length - 1) / 3));
      const points = n >= 1 ? pts.slice(0, 1 + 3 * n) : [{ x: -6, y: 0 }, { x: -2, y: -5 }, { x: 2, y: 5 }, { x: 6, y: 0 }];
      return { ...base, type, points, closed: raw.closed === true };
    }
    case "connector":
      return { ...base, type, from: vec(raw.from, { x: -5, y: 0 }), to: vec(raw.to, { x: 5, y: 0 }), bulge: num(raw.bulge, 0, -100, 100) };
    case "shape":
      return { ...base, type, motif: typeof raw.motif === "string" && hasMotif(raw.motif) ? raw.motif : "heart" };
    case "compound":
      return { ...base, type, ref: typeof raw.ref === "string" ? raw.ref.slice(0, 80) : "" };
    default:
      return { ...base, type } as SectorElement;
  }
}

function normalizeElements(raw: unknown): SectorElement[] {
  const list = Array.isArray(raw) ? raw.slice(0, LIMITS.elements) : [];
  const out: SectorElement[] = [];
  const ids = new Set<string>();
  for (const e of list) {
    const el = normalizeElement(e);
    if (!el) continue;
    if (ids.has(el.id)) el.id = newId("e");
    ids.add(el.id);
    out.push(el);
  }
  return out;
}

export function normalizeRing(raw: unknown, index: number): Ring {
  const r = isRecord(raw) ? raw : {};
  return {
    id: id(r.id, "r"),
    name: str(r.name, `Ring ${index + 1}`),
    visible: r.visible !== false,
    radius: num(r.radius, 40, LIMITS.radius.min, LIMITS.radius.max),
    repeat: Math.round(num(r.repeat, 8, LIMITS.repeat.min, LIMITS.repeat.max)),
    phase: num(r.phase, 0, LIMITS.phase.min, LIMITS.phase.max),
    mirrorLocal: r.mirrorLocal === true,
    elements: normalizeElements(r.elements),
  };
}

function normalizeCenter(raw: unknown): CenterMotif {
  const c = isRecord(raw) ? raw : {};
  const types: CenterMotif["type"][] = ["none", "radialPetals", "sunflower", "starburst", "circularPetals"];
  return {
    type: types.includes(c.type as CenterMotif["type"]) ? (c.type as CenterMotif["type"]) : DEFAULT_CENTER.type,
    petals: Math.round(num(c.petals, DEFAULT_CENTER.petals, 3, 96)),
    innerRadius: num(c.innerRadius, DEFAULT_CENTER.innerRadius, 0, 200),
    outerRadius: num(c.outerRadius, DEFAULT_CENTER.outerRadius, 0.5, 300),
    petalWidth: num(c.petalWidth, DEFAULT_CENTER.petalWidth, 0.2, 100),
    coreRadius: num(c.coreRadius, DEFAULT_CENTER.coreRadius, 0, 100),
    strokeWidth: num(c.strokeWidth, 0, 0, 20),
    rotation: num(c.rotation, 0, -180, 180),
  };
}

function normalizeCompound(raw: unknown): CompoundMotif | null {
  if (!isRecord(raw)) return null;
  return { id: id(raw.id, "c"), name: str(raw.name, "Compound", 60), elements: normalizeElements(raw.elements) };
}

function normalizeConstraints(raw: unknown): Constraints {
  const c = isRecord(raw) ? raw : {};
  const lim = LIMITS.constraint;
  return {
    minBridgeWidth: num(c.minBridgeWidth, DEFAULT_CONSTRAINTS.minBridgeWidth, lim.min, lim.max),
    minFeatureWidth: num(c.minFeatureWidth, DEFAULT_CONSTRAINTS.minFeatureWidth, lim.min, lim.max),
    minGap: num(c.minGap, DEFAULT_CONSTRAINTS.minGap, lim.min, lim.max),
    minHoleDiameter: num(c.minHoleDiameter, DEFAULT_CONSTRAINTS.minHoleDiameter, lim.min, lim.max),
  };
}

function normalizeBridges(raw: unknown): BridgeSettings {
  const b = isRecord(raw) ? raw : {};
  return {
    auto: b.auto !== false,
    width: num(b.width, DEFAULT_BRIDGES.width, 0.2, 50),
    centerCount: b.centerCount === "auto" || b.centerCount === undefined ? "auto" : Math.round(num(b.centerCount, 4, 1, 64)),
    perIsland: b.perIsland === 1 ? 1 : 2,
    overlap: num(b.overlap, DEFAULT_BRIDGES.overlap, 0, 5),
  };
}

function normalizeSheet(raw: unknown): Sheet {
  const s = isRecord(raw) ? raw : {};
  return {
    width: num(s.width, DEFAULT_SHEET.width, LIMITS.sheet.min, LIMITS.sheet.max),
    height: num(s.height, DEFAULT_SHEET.height, LIMITS.sheet.min, LIMITS.sheet.max),
    outline: s.outline === true,
    cornerRadius: num(s.cornerRadius, 0, 0, 100),
  };
}

function normalizeManualBridge(raw: unknown): ManualBridge | null {
  if (!isRecord(raw)) return null;
  return {
    id: id(raw.id, "b"),
    x: num(raw.x, 0, -1000, 1000),
    y: num(raw.y, 0, -1000, 1000),
    length: num(raw.length, 10, 0.2, 500),
    width: num(raw.width, 1.5, 0.2, 50),
    rotation: num(raw.rotation, 0, -360, 360),
  };
}

/** Old (v1) motif ids that became element types. Everything else becomes a `shape` element. */
const V1_MOTIF_TO_TYPE: Record<string, ElementType> = { circle: "circle", dot: "dot", petal: "petal", leaf: "leaf", teardrop: "teardrop", arc: "arc", spiral: "spiral", paisley: "paisley" };

/** v1 ring (one simple motif repeated `count` times) -> v2 ring with one element. */
function migrateV1Ring(raw: Record<string, unknown>, index: number): Ring {
  const motif = typeof raw.motif === "string" ? raw.motif : "circle";
  const type = V1_MOTIF_TO_TYPE[motif] ?? "shape";
  const p = params(raw.params);
  const elementRaw: Record<string, unknown> = {
    type,
    length: raw.length,
    width: raw.width,
    strokeWidth: raw.strokeWidth,
    rotation: num(raw.rotation, 0, -360, 360) + (raw.direction === "inward" ? 180 : 0),
    inset: raw.inset,
    insetStem: raw.insetStem,
    params: type === "paisley" ? { curl: p.bend ?? 0.7 } : p,
  };
  if (type === "shape") elementRaw.motif = hasMotif(motif) ? motif : "heart";
  const element = normalizeElement(elementRaw)!;
  return {
    id: id(raw.id, "r"),
    name: str(raw.name, `Ring ${index + 1}`),
    visible: raw.visible !== false,
    radius: num(raw.radius, 40, LIMITS.radius.min, LIMITS.radius.max),
    repeat: Math.round(num(raw.count, 8, LIMITS.repeat.min, LIMITS.repeat.max)),
    phase: num(raw.phase, 0, LIMITS.phase.min, LIMITS.phase.max),
    mirrorLocal: false,
    elements: [element],
  };
}

/**
 * Validate and normalise untrusted project JSON (file, URL, localStorage, presets).
 * v1 projects (rings with `motif`/`count`) are migrated to v2 sectors.
 */
export function normalizeProject(raw: unknown): Project {
  const p = isRecord(raw) ? raw : {};
  const ringsRaw = Array.isArray(p.rings) ? p.rings.slice(0, LIMITS.rings) : [];
  const isV1 = p.version === 1 || ringsRaw.some((r) => isRecord(r) && typeof r.motif === "string" && !Array.isArray(r.elements));
  const rings = ringsRaw.map((r, i) => (isV1 && isRecord(r) ? migrateV1Ring(r, i) : normalizeRing(r, i)));
  const ids = new Set<string>();
  for (const r of rings) {
    if (ids.has(r.id)) r.id = newId("r");
    ids.add(r.id);
  }
  const seed = typeof p.seed === "number" && Number.isFinite(p.seed) ? Math.floor(p.seed) : undefined;
  const gen = isRecord(p.generator) ? p.generator : null;
  const project: Project = {
    version: PROJECT_VERSION,
    app: str(p.app, APP_VERSION, 20),
    name: str(p.name, "Untitled Mandala"),
    symmetry: Math.round(num(p.symmetry, 8, LIMITS.symmetry.min, LIMITS.symmetry.max)),
    sheet: normalizeSheet(p.sheet),
    center: isV1 && p.center === undefined ? { ...DEFAULT_CENTER, type: "none" } : normalizeCenter(p.center),
    rings,
    compounds: (Array.isArray(p.compounds) ? p.compounds.slice(0, 64) : []).map(normalizeCompound).filter((c): c is CompoundMotif => c !== null),
    constraints: normalizeConstraints(p.constraints),
    bridges: normalizeBridges(p.bridges),
    manualBridges: (Array.isArray(p.manualBridges) ? p.manualBridges : []).map(normalizeManualBridge).filter((b): b is ManualBridge => b !== null),
  };
  if (seed !== undefined) project.seed = seed;
  if (gen) {
    project.generator = {
      symmetry: Math.round(num(gen.symmetry, 8, 1, 64)),
      density: num(gen.density, 0.5, 0, 1),
      seed: Math.floor(num(gen.seed, 1, 0, 2 ** 32)),
    };
  }
  return project;
}

export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み込めませんでした。");
  }
  if (!isRecord(raw) || !Array.isArray(raw.rings)) throw new Error("MandalaFabのプロジェクトファイルではありません。");
  return normalizeProject(raw);
}
