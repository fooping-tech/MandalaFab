import { getMotif, hasMotif } from "../geometry/motifs/registry";
import {
  DEFAULT_BRIDGES,
  DEFAULT_CONSTRAINTS,
  DEFAULT_SHEET,
  LIMITS,
  PROJECT_VERSION,
  APP_VERSION,
  newId,
  type BridgeSettings,
  type Constraints,
  type ManualBridge,
  type Project,
  type Ring,
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

export function normalizeRing(raw: unknown, index: number): Ring {
  const r = isRecord(raw) ? raw : {};
  const motif = typeof r.motif === "string" && hasMotif(r.motif) ? r.motif : "circle";
  const def = getMotif(motif);
  const params: Record<string, number> = {};
  const rawParams = isRecord(r.params) ? r.params : {};
  for (const spec of def.params) params[spec.key] = num(rawParams[spec.key], spec.default, spec.min, spec.max);
  return {
    id: typeof r.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(r.id) ? r.id : newId(),
    name: str(r.name, `Ring ${index + 1}`),
    visible: r.visible !== false,
    motif,
    count: Math.round(num(r.count, 8, LIMITS.count.min, LIMITS.count.max)),
    radius: num(r.radius, 40, LIMITS.radius.min, LIMITS.radius.max),
    length: num(r.length, 20, LIMITS.length.min, LIMITS.length.max),
    width: num(r.width, 10, LIMITS.width.min, LIMITS.width.max),
    rotation: num(r.rotation, 0, LIMITS.rotation.min, LIMITS.rotation.max),
    rotationMode: r.rotationMode === "fixed" ? "fixed" : "radial",
    phase: num(r.phase, 0, LIMITS.phase.min, LIMITS.phase.max),
    strokeWidth: num(r.strokeWidth, 0, LIMITS.strokeWidth.min, LIMITS.strokeWidth.max),
    stagger: num(r.stagger, 0, LIMITS.stagger.min, LIMITS.stagger.max),
    direction: r.direction === "inward" ? "inward" : "outward",
    params,
  };
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
    id: typeof raw.id === "string" ? raw.id : newId("b"),
    x: num(raw.x, 0, -1000, 1000),
    y: num(raw.y, 0, -1000, 1000),
    length: num(raw.length, 10, 0.2, 500),
    width: num(raw.width, 1.5, 0.2, 50),
    rotation: num(raw.rotation, 0, -360, 360),
  };
}

/**
 * Validate and normalise untrusted project JSON (file, URL, localStorage).
 * Invalid values are clamped or replaced by defaults; unknown motifs become circles.
 */
export function normalizeProject(raw: unknown): Project {
  const p = isRecord(raw) ? raw : {};
  const ringsRaw = Array.isArray(p.rings) ? p.rings.slice(0, LIMITS.rings) : [];
  const rings = ringsRaw.map(normalizeRing);
  const ids = new Set<string>();
  for (const r of rings) {
    if (ids.has(r.id)) r.id = newId();
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
    rings,
    constraints: normalizeConstraints(p.constraints),
    bridges: normalizeBridges(p.bridges),
    manualBridges: (Array.isArray(p.manualBridges) ? p.manualBridges : []).map(normalizeManualBridge).filter((b): b is ManualBridge => b !== null),
  };
  if (seed !== undefined) project.seed = seed;
  if (gen) {
    project.generator = {
      symmetry: Math.round(num(gen.symmetry, 8, 1, 64)),
      complexity: num(gen.complexity, 3, 1, 5),
      ringCount: Math.round(num(gen.ringCount, 5, 1, 16)),
      density: num(gen.density, 0.5, 0, 1),
      seed: Math.floor(num(gen.seed, 1, 0, 2 ** 32)),
    };
  }
  return project;
}

/** Parse project JSON text; throws with a user-facing message when unusable. */
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
