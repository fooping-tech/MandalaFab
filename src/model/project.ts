/**
 * Project data model (what is saved as JSON / shared via URL).
 * Pure types + defaults; no React.
 */

export const PROJECT_VERSION = 1 as const;
export const APP_VERSION = "0.1.0";

export type RotationMode = "radial" | "fixed";
export type Direction = "outward" | "inward";

export interface Ring {
  id: string;
  name: string;
  visible: boolean;
  /** Motif id from the motif registry. */
  motif: string;
  /** Number of copies around the circle. */
  count: number;
  /** Distance from the mandala center to the motif center (mm). */
  radius: number;
  /** Radial extent of the motif (mm). UI label: 幅. */
  length: number;
  /** Tangential extent of the motif (mm). UI label: サイズ. */
  width: number;
  /** Extra rotation applied to every motif (degrees). */
  rotation: number;
  rotationMode: RotationMode;
  /** Angular phase offset (degrees). UI label: オフセット. */
  phase: number;
  /** 0 = filled shape; > 0 = outline band of this width (mm). UI label: 線幅. */
  strokeWidth: number;
  /** Alternate copies are pushed outward by this radial distance (mm). UI label: 間隔. */
  stagger: number;
  direction: Direction;
  /** Motif specific parameters (see MotifDefinition.params). */
  params: Record<string, number>;
}

export interface Constraints {
  minBridgeWidth: number;
  minFeatureWidth: number;
  minGap: number;
  minHoleDiameter: number;
}

export interface BridgeSettings {
  /** Automatic bridge generation on/off. */
  auto: boolean;
  width: number;
  /** Number of bridges for the central island: "auto" derives it from symmetry. */
  centerCount: number | "auto";
  /** Bridges per off-center island: 1 (shortest) or 2 (inward + outward). */
  perIsland: 1 | 2;
  /** Extra length the bridge extends into material on both ends (mm). */
  overlap: number;
}

export interface ManualBridge {
  id: string;
  x: number;
  y: number;
  /** Length along the bridge direction (mm). */
  length: number;
  width: number;
  /** Direction in degrees. */
  rotation: number;
}

export interface Sheet {
  width: number;
  height: number;
  /** Export the sheet outline as a cut path. */
  outline: boolean;
  /** Corner radius for the outline (mm). */
  cornerRadius: number;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  app: string;
  name: string;
  symmetry: number;
  sheet: Sheet;
  rings: Ring[];
  constraints: Constraints;
  bridges: BridgeSettings;
  manualBridges: ManualBridge[];
  /** Seed used by the generator (kept for reproducibility). */
  seed?: number;
  /** Generator inputs, kept so the design can be regenerated. */
  generator?: GeneratorParams;
}

export interface GeneratorParams {
  symmetry: number;
  complexity: number;
  ringCount: number;
  density: number;
  seed: number;
}

export const SYMMETRY_PRESETS = [4, 6, 8, 10, 12, 16, 24, 32] as const;

export const SHEET_PRESETS: readonly { label: string; width: number; height: number }[] = [
  { label: "100 × 100 mm", width: 100, height: 100 },
  { label: "150 × 150 mm", width: 150, height: 150 },
  { label: "200 × 200 mm", width: 200, height: 200 },
  { label: "300 × 300 mm", width: 300, height: 300 },
];

export const DEFAULT_CONSTRAINTS: Constraints = {
  minBridgeWidth: 1.5,
  minFeatureWidth: 1.0,
  minGap: 1.0,
  minHoleDiameter: 1.0,
};

export interface MaterialPreset {
  id: string;
  label: string;
  constraints: Constraints;
}

/** Material presets are a thin layer over Constraints so more can be added later. */
export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  { id: "default", label: "標準", constraints: DEFAULT_CONSTRAINTS },
  { id: "paper", label: "紙 (クラフト紙 0.2 mm)", constraints: { minBridgeWidth: 2.0, minFeatureWidth: 1.0, minGap: 1.5, minHoleDiameter: 1.0 } },
  { id: "plastic", label: "プラ板 / PET 0.3 mm", constraints: { minBridgeWidth: 1.5, minFeatureWidth: 0.8, minGap: 1.0, minHoleDiameter: 0.8 } },
  { id: "mdf", label: "MDF 2.5 mm", constraints: { minBridgeWidth: 2.5, minFeatureWidth: 1.5, minGap: 2.0, minHoleDiameter: 1.5 } },
  { id: "acrylic", label: "アクリル 2 mm", constraints: { minBridgeWidth: 2.0, minFeatureWidth: 1.2, minGap: 1.5, minHoleDiameter: 1.2 } },
];

export const DEFAULT_BRIDGES: BridgeSettings = {
  auto: true,
  width: 1.5,
  centerCount: "auto",
  perIsland: 2,
  overlap: 0.3,
};

export const DEFAULT_SHEET: Sheet = { width: 150, height: 150, outline: false, cornerRadius: 0 };

let idCounter = 0;
export function newId(prefix = "r"): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function defaultRing(partial: Partial<Ring> = {}): Ring {
  return {
    id: newId(),
    name: "Ring",
    visible: true,
    motif: "petal",
    count: 8,
    radius: 40,
    length: 20,
    width: 10,
    rotation: 0,
    rotationMode: "radial",
    phase: 0,
    strokeWidth: 0,
    stagger: 0,
    direction: "outward",
    params: {},
    ...partial,
  };
}

export function emptyProject(name = "Untitled Mandala"): Project {
  return {
    version: PROJECT_VERSION,
    app: APP_VERSION,
    name,
    symmetry: 8,
    sheet: { ...DEFAULT_SHEET },
    rings: [],
    constraints: { ...DEFAULT_CONSTRAINTS },
    bridges: { ...DEFAULT_BRIDGES },
    manualBridges: [],
  };
}

/** Numeric limits used by the inspector and the JSON validator. */
export const LIMITS = {
  symmetry: { min: 1, max: 64 },
  count: { min: 1, max: 360 },
  radius: { min: 0, max: 500 },
  length: { min: 0.2, max: 300 },
  width: { min: 0.2, max: 300 },
  rotation: { min: -180, max: 180 },
  phase: { min: -180, max: 180 },
  strokeWidth: { min: 0, max: 20 },
  stagger: { min: -50, max: 50 },
  sheet: { min: 10, max: 1000 },
  constraint: { min: 0.1, max: 20 },
  rings: 64,
} as const;
