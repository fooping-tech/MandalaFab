/**
 * Project data model v2 (what is saved as JSON / shared via URL).
 *
 * A mandala is: a center motif + rings. A ring is a *sector*: a set of elements
 * designed in one angular sector (optionally only its left half, mirrored) that is
 * rotated `repeat` times around the center. Elements are organic shapes built
 * from cubic Bézier curves, reusable compound motifs, or legacy simple shapes.
 * Pure types + defaults; no React.
 */
import type { Vec2 } from "../geometry/types";

export const PROJECT_VERSION = 2 as const;
export const APP_VERSION = "0.2.0";

export type ElementType =
  | "bezier"
  | "teardrop"
  | "leaf"
  | "petal"
  | "spiral"
  | "scurve"
  | "curl"
  | "paisley"
  | "arc"
  | "dot"
  | "circle"
  | "connector"
  | "shape"
  | "compound"
  | "ccurve"
  | "hook"
  | "vine"
  | "doublecurl"
  | "opposedcurl"
  | "tendril"
  | "arch"
  | "fan"
  | "zigzag";

/** Ornamental role of an element inside a sector composition (for the tree, stats and tests). */
export type OrnamentRole = "primary" | "secondary" | "flow" | "filler" | "boundary";

export type BooleanMode = "cut" | "keep";
export type Orientation = "sector" | "radial";

/**
 * Common element fields. Elements live in the sector frame: +x points radially
 * outward along the sector axis, +y is tangential, origin = (ring.radius, 0).
 */
export interface ElementBase {
  id: string;
  type: ElementType;
  name?: string;
  visible: boolean;
  /** Locked objects cannot be selected or moved on the canvas (still editable from the tree / Inspector). */
  locked?: boolean;
  /** Local position in the sector frame (mm). */
  x: number;
  y: number;
  /** Rotation in degrees (positive = clockwise on screen). */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** Flip across the element's own axis. */
  mirror: boolean;
  /** Radial extent of the shape before scaling (mm). */
  length: number;
  /** Tangential extent before scaling (mm). */
  width: number;
  /** 0 = filled shape; > 0 = outline band / line width (mm). */
  strokeWidth: number;
  /** cut = aperture (removed material), keep = material preserved inside earlier cuts of this ring. */
  mode: BooleanMode;
  /** sector = as placed; radial = rotated so +x points away from the mandala center. */
  orient: Orientation;
  /** Local radial repeat inside the sector (copies spread over `repeatSpread` degrees around the center). */
  repeat: number;
  /** Angular spread of the local repeat in degrees (0 = full sector angle). */
  repeatSpread: number;
  /** Border width (mm): keeps an inner copy of the shape as material. 0 = none. */
  inset: number;
  /** Stem width (mm) keeping the inset material attached at the base. 0 = auto bridge. */
  insetStem: number;
  /** Type-specific numeric parameters. */
  params: Record<string, number>;
  /** Ornamental role (optional, informational). */
  role?: OrnamentRole;
  /**
   * Nested ornament: elements placed in this element's local frame and combined with it
   * (keep children leave material inside the parent cut, cut children cut into that material).
   */
  children?: SectorElement[];
  /** Set by Reference Image Import: what the recogniser thought the shape was and how sure it is (0..1). */
  imported?: { detectedType: string; confidence: number };
}

export interface BezierElement extends ElementBase {
  type: "bezier";
  /** start, then (cp1, cp2, end) per segment: length = 1 + 3n. Local coordinates (mm). */
  points: Vec2[];
  closed: boolean;
}

export interface ConnectorElement extends ElementBase {
  type: "connector";
  /** Straight or curved bar between two local points, always `keep` material or `cut` band. */
  from: Vec2;
  to: Vec2;
  /** Bulge of the connector (0 = straight, mm sideways at the middle). */
  bulge: number;
}

export interface ShapeElement extends ElementBase {
  type: "shape";
  /** Motif id from the simple-shape registry (heart, star, polygon, ...). */
  motif: string;
}

export interface CompoundElement extends ElementBase {
  type: "compound";
  /** Id of a CompoundMotif in project.compounds. */
  ref: string;
}

export interface SimpleElement extends ElementBase {
  type: "teardrop" | "leaf" | "petal" | "spiral" | "scurve" | "curl" | "paisley" | "arc" | "dot" | "circle" | "ccurve" | "hook" | "vine" | "doublecurl" | "opposedcurl" | "tendril" | "arch" | "fan" | "zigzag";
}

/** Element types whose closed contours are tapered bands (strokeWidth = base width, not an outline). */
export const BAND_TYPES: ReadonlySet<ElementType> = new Set<ElementType>(["ccurve", "hook", "vine", "doublecurl", "opposedcurl", "tendril", "zigzag"]);

export type SectorElement = BezierElement | ConnectorElement | ShapeElement | CompoundElement | SimpleElement;

/** Reusable group of elements in their own local frame. */
export interface CompoundMotif {
  id: string;
  name: string;
  elements: SectorElement[];
}

/** A ring is one sector design repeated around the center. */
export interface Ring {
  id: string;
  name: string;
  visible: boolean;
  /** Locked objects cannot be selected or moved on the canvas (still editable from the tree / Inspector). */
  locked?: boolean;
  /** Base radius of the sector frame origin (mm). */
  radius: number;
  /** Number of sectors around the circle (usually symmetry or a multiple). */
  repeat: number;
  /** Angular phase offset (degrees). */
  phase: number;
  /** Design only the y >= 0 half of the sector and mirror it across the sector axis. */
  mirrorLocal: boolean;
  elements: SectorElement[];
}

export type CenterType = "none" | "radialPetals" | "sunflower" | "starburst" | "circularPetals";

export interface CenterMotif {
  type: CenterType;
  petals: number;
  innerRadius: number;
  outerRadius: number;
  petalWidth: number;
  /** Radius of the central cut disc (0 = none). */
  coreRadius: number;
  /** 0 = filled petals; > 0 = outline band width. */
  strokeWidth: number;
  rotation: number;
}

export interface Constraints {
  minBridgeWidth: number;
  minFeatureWidth: number;
  minGap: number;
  minHoleDiameter: number;
}

export interface BridgeSettings {
  auto: boolean;
  width: number;
  centerCount: number | "auto";
  perIsland: 1 | 2;
  overlap: number;
}

export interface ManualBridge {
  id: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotation: number;
}

/** What the laser leaves behind: the sheet with the mandala cut out, or the mandala itself. */
export type OutputPolarity = "stencil" | "positive";

export interface OutputSettings {
  polarity: OutputPolarity;
  /** Positive mode: the narrowest material link that counts as connected (mm). */
  minConnectionWidth: number;
  /** Positive mode: join separate pieces with curved connector bands automatically. */
  autoConnect: boolean;
  /** Positive mode: longest gap an automatic connector may span (mm). */
  maxConnectorSpan: number;
}

export const DEFAULT_OUTPUT: OutputSettings = { polarity: "stencil", minConnectionWidth: 1.5, autoConnect: true, maxConnectorSpan: 14 };

export interface Sheet {
  width: number;
  height: number;
  outline: boolean;
  cornerRadius: number;
}

export interface GeneratorParams {
  symmetry: number;
  density: number;
  seed: number;
  /** How often user parts (マイパーツ) are tried for primary / secondary / filler slots, 0..1 (0 or absent = never). */
  partsFrequency?: number;
  /** Relative weight of each user part by library id (0 = excluded). */
  partWeights?: Record<string, number>;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  app: string;
  name: string;
  symmetry: number;
  sheet: Sheet;
  center: CenterMotif;
  rings: Ring[];
  compounds: CompoundMotif[];
  constraints: Constraints;
  bridges: BridgeSettings;
  manualBridges: ManualBridge[];
  output: OutputSettings;
  seed?: number;
  generator?: GeneratorParams;
}

export const SYMMETRY_PRESETS = [4, 6, 8, 10, 12, 16, 24, 32] as const;

export const SHEET_PRESETS: readonly { label: string; width: number; height: number }[] = [
  { label: "100 × 100 mm", width: 100, height: 100 },
  { label: "150 × 150 mm", width: 150, height: 150 },
  { label: "200 × 200 mm", width: 200, height: 200 },
  { label: "300 × 300 mm", width: 300, height: 300 },
];

export const DEFAULT_CONSTRAINTS: Constraints = { minBridgeWidth: 1.5, minFeatureWidth: 1.0, minGap: 1.0, minHoleDiameter: 1.0 };

export interface MaterialPreset {
  id: string;
  label: string;
  constraints: Constraints;
}

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  { id: "default", label: "標準", constraints: DEFAULT_CONSTRAINTS },
  { id: "paper", label: "紙 (クラフト紙 0.2 mm)", constraints: { minBridgeWidth: 2.0, minFeatureWidth: 1.0, minGap: 1.5, minHoleDiameter: 1.0 } },
  { id: "plastic", label: "プラ板 / PET 0.3 mm", constraints: { minBridgeWidth: 1.5, minFeatureWidth: 0.8, minGap: 1.0, minHoleDiameter: 0.8 } },
  { id: "mdf", label: "MDF 2.5 mm", constraints: { minBridgeWidth: 2.5, minFeatureWidth: 1.5, minGap: 2.0, minHoleDiameter: 1.5 } },
  { id: "acrylic", label: "アクリル 2 mm", constraints: { minBridgeWidth: 2.0, minFeatureWidth: 1.2, minGap: 1.5, minHoleDiameter: 1.2 } },
];

export const DEFAULT_BRIDGES: BridgeSettings = { auto: true, width: 1.5, centerCount: "auto", perIsland: 2, overlap: 0.3 };
export const DEFAULT_SHEET: Sheet = { width: 150, height: 150, outline: false, cornerRadius: 0 };
export const DEFAULT_CENTER: CenterMotif = { type: "radialPetals", petals: 16, innerRadius: 5, outerRadius: 18, petalWidth: 4, coreRadius: 3, strokeWidth: 0, rotation: 0 };

let idCounter = 0;
export function newId(prefix = "e"): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const ELEMENT_TYPES: readonly { type: ElementType; label: string; description: string }[] = [
  { type: "teardrop", label: "Teardrop", description: "涙滴。Bezier で生成、曲がりと先端の鋭さを調整。" },
  { type: "leaf", label: "Leaf", description: "左右2本の Bezier からなる葉。" },
  { type: "petal", label: "Petal", description: "両端が尖った花弁。" },
  { type: "paisley", label: "Paisley", description: "勾玉・ペイズリー。内側に材料を残す innerGap 付き。" },
  { type: "scurve", label: "S-Curve", description: "S字曲線（線幅で帯にする）。" },
  { type: "curl", label: "Curl", description: "先端が渦を巻く曲線。" },
  { type: "ccurve", label: "C-Curve", description: "テーパー付きの C 字帯。" },
  { type: "hook", label: "Hook", description: "茎の先が小さく巻く鉤（テーパー帯）。" },
  { type: "vine", label: "Vine", description: "うねる蔓（テーパー帯、波数指定）。" },
  { type: "doublecurl", label: "Double Curl", description: "両端が同じ向きに巻く S 字帯。" },
  { type: "opposedcurl", label: "Opposed Curl", description: "1本の茎から逆向きに 2 つ巻く帯。" },
  { type: "tendril", label: "Tendril", description: "細く長く伸びて先端が強く巻く巻きひげ。" },
  { type: "arch", label: "Arch", description: "丸〜尖りアーチ（窓形）。縁取りで二重アーチに。" },
  { type: "fan", label: "Fan", description: "アーチを放射状の材料スポークで分けた扇。内側の半円「眼」も置ける。" },
  { type: "zigzag", label: "Zigzag", description: "ジグザグ帯（三角の連なり）。" },
  { type: "spiral", label: "Spiral", description: "渦巻き線。" },
  { type: "arc", label: "Arc", description: "中心と同心の円弧帯。" },
  { type: "dot", label: "Dot", description: "小さな円。" },
  { type: "circle", label: "Circle", description: "楕円（塗り／輪郭線）。" },
  { type: "bezier", label: "Bezier Path", description: "自由な 3次 Bezier パス（開いた線 or 閉じた形）。" },
  { type: "connector", label: "Connector", description: "2点をつなぐ帯。keep モードで材料の橋になる。" },
  { type: "shape", label: "Shape", description: "ハート・星・多角形などの基本形。" },
  { type: "compound", label: "Compound", description: "再利用可能な複合モチーフの配置。" },
];

export function elementDefaults(): ElementBase {
  return {
    id: newId(),
    type: "teardrop",
    visible: true,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    mirror: false,
    length: 12,
    width: 6,
    strokeWidth: 0,
    mode: "cut",
    orient: "sector",
    repeat: 1,
    repeatSpread: 0,
    inset: 0,
    insetStem: 0,
    params: {},
  };
}

/** Create an element of a given type with sensible defaults. */
export function newElement(type: ElementType, partial: Partial<SectorElement> = {}): SectorElement {
  const base = { ...elementDefaults(), type } as ElementBase;
  switch (type) {
    case "bezier":
      return { ...base, type, points: [{ x: -6, y: 0 }, { x: -2, y: -5 }, { x: 2, y: 5 }, { x: 6, y: 0 }], closed: false, strokeWidth: 1.5, ...partial } as BezierElement;
    case "connector":
      return { ...base, type, from: { x: -5, y: 0 }, to: { x: 5, y: 0 }, bulge: 0, strokeWidth: 1.5, mode: "keep", ...partial } as ConnectorElement;
    case "shape":
      return { ...base, type, motif: "heart", ...partial } as ShapeElement;
    case "compound":
      return { ...base, type, ref: "", ...partial } as CompoundElement;
    case "scurve":
    case "curl":
    case "spiral":
      return { ...base, type, strokeWidth: 1.5, ...partial } as SimpleElement;
    case "ccurve":
    case "hook":
    case "vine":
    case "doublecurl":
    case "opposedcurl":
    case "tendril":
      return { ...base, type, strokeWidth: 1.8, length: 14, width: 8, ...partial } as SimpleElement;
    case "paisley":
      return { ...base, type, length: 14, width: 7, ...partial } as SimpleElement;
    case "arch":
      return { ...base, type, length: 12, width: 8, ...partial } as SimpleElement;
    case "fan":
      return { ...base, type, length: 10, width: 12, ...partial } as SimpleElement;
    case "zigzag":
      return { ...base, type, strokeWidth: 1.5, length: 16, width: 4, ...partial } as SimpleElement;
    case "dot":
      return { ...base, type, length: 2.5, width: 2.5, ...partial } as SimpleElement;
    case "arc":
      return { ...base, type, length: 2.5, width: 12, ...partial } as SimpleElement;
    default:
      return { ...base, type, ...partial } as SimpleElement;
  }
}

export function defaultRing(partial: Partial<Ring> = {}): Ring {
  return { id: newId("r"), name: "Ring", visible: true, radius: 40, repeat: 8, phase: 0, mirrorLocal: true, elements: [], ...partial };
}

export function emptyProject(name = "Untitled Mandala"): Project {
  return {
    version: PROJECT_VERSION,
    app: APP_VERSION,
    name,
    symmetry: 8,
    sheet: { ...DEFAULT_SHEET },
    center: { ...DEFAULT_CENTER },
    rings: [],
    compounds: [],
    constraints: { ...DEFAULT_CONSTRAINTS },
    bridges: { ...DEFAULT_BRIDGES },
    manualBridges: [],
    output: { ...DEFAULT_OUTPUT },
  };
}

export const LIMITS = {
  symmetry: { min: 1, max: 64 },
  repeat: { min: 1, max: 360 },
  radius: { min: 0, max: 500 },
  length: { min: 0.2, max: 300 },
  width: { min: 0.2, max: 300 },
  rotation: { min: -180, max: 180 },
  phase: { min: -180, max: 180 },
  strokeWidth: { min: 0, max: 20 },
  position: { min: -300, max: 300 },
  scale: { min: 0.05, max: 10 },
  inset: { min: 0, max: 20 },
  sheet: { min: 10, max: 1000 },
  constraint: { min: 0.1, max: 20 },
  rings: 64,
  elements: 200,
} as const;
