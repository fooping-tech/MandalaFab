/**
 * Steps 4–9: traced contours (pixels) → MandalaFab project. Shapes are reduced
 * to one sector (repeat = symmetry, mirrorLocal when a mirror axis was found),
 * clustered into rings by centroid radius, recognised as primitives when the
 * fit is convincing and kept as Bézier paths otherwise. Holes inside a shape
 * become `keep` children so material inside an aperture is preserved.
 */
import { emptyProject, newElement, newId, type Project, type Ring, type SectorElement } from "../model/project";
import { instanceTransform } from "../geometry/radial/repeat";
import { invertTransform, type Transform } from "../geometry/radial/transform";
import type { Contour, Vec2 } from "../geometry/types";
import { area, centroid, containsPoint, perimeter, simplifyContour } from "../geometry/vec";
import { flattenRegions, offset } from "../geometry/boolean";
import { fitClosedPolygon, simplifyPolygon } from "./bezier-fit";
import { recognizePrimitive, RECOGNITION_ACCEPT } from "./primitive-recognition";
import { clusterRings } from "./ring-cluster";
import { pickSectorContours, rotateContour } from "./sector-extract";
import { estimateStrokeWidth } from "./contours";
import type { Point, TracedContour } from "./types";

export type ImportMode = "trace" | "stencil" | "cells" | "positive";

export interface BandSetting {
  rMinMm: number;
  rMaxMm: number;
  n: number;
  mirrorAxisDeg: number | null;
}

export interface ConvertSettings {
  symmetry: number;
  /** Optional per-band symmetry (mm radii); rings take the n of the band they sit in. */
  bands?: BandSetting[];
  /** Mirror axis / sector axis angle in degrees (0 = up, clockwise). */
  phaseDeg: number;
  mirror: boolean;
  /** Mandala center in (binary) image pixels. */
  center: Point;
  /** Millimetres per image pixel. */
  mmPerPx: number;
  sheet: { width: number; height: number };
  mode: ImportMode;
  /** Douglas–Peucker tolerance in mm. */
  simplifyMm: number;
  /** Bézier fit tolerance in mm. */
  bezierErrorMm: number;
  recognize: boolean;
  ringDetect: boolean;
  minFeatureWidth: number;
  minHoleDiameter: number;
  /** Minimum material web width (mm), used to shrink line-art cells. */
  minGap: number;
  name: string;
}

export interface ImportedElementInfo {
  id: string;
  ringId: string;
  type: string;
  detectedType: string;
  confidence: number;
  areaMm2: number;
}

export interface ConvertStats {
  contours: number;
  sectorContours: number;
  centerContours: number;
  rings: number;
  elements: number;
  /** Shapes kept at their world position because they did not repeat around the center. */
  unmatched: number;
  recognized: number;
  lowConfidence: number;
  droppedSmall: number;
  /** Thin line-art strokes widened to the minimum feature width (stencil mode). */
  thickened: number;
}

/** Tolerances relative to the stroke width so thin line art is not destroyed by simplification. */
export function autoTolerances(strokeWidthMm: number, simplifyMm: number, bezierErrorMm: number): { simplifyMm: number; bezierErrorMm: number } {
  if (strokeWidthMm <= 0) return { simplifyMm, bezierErrorMm };
  return { simplifyMm: Math.min(simplifyMm, Math.max(0.03, strokeWidthMm / 5)), bezierErrorMm: Math.min(bezierErrorMm, Math.max(0.05, strokeWidthMm / 3)) };
}

export interface ConversionResult {
  project: Project;
  elements: ImportedElementInfo[];
  stats: ConvertStats;
}

interface Shape {
  outer: Contour;
  holes: Contour[];
}

/** Group traced contours into shapes (outer + direct holes) in mm world coordinates centred on the mandala center. */
export function shapesFromContours(contours: readonly TracedContour[], center: Point, mmPerPx: number, simplifyMm: number): Shape[] {
  const toMm = (pts: Point[]): Contour => pts.map((p) => ({ x: (p.x - center.x) * mmPerPx, y: (p.y - center.y) * mmPerPx }));
  const eps = simplifyMm / mmPerPx;
  const outers = contours.filter((c) => !c.hole).map((c) => toMm(simplifyPolygon(c.points, eps)));
  const holes = contours.filter((c) => c.hole).map((c) => toMm(simplifyPolygon(c.points, eps)));
  const shapes: Shape[] = outers.filter((o) => o.length >= 3).map((outer) => ({ outer, holes: [] }));
  // Each hole belongs to the smallest outer that contains it.
  for (const h of holes) {
    if (h.length < 3) continue;
    const p = h[0]!;
    let best: Shape | null = null;
    let bestArea = Infinity;
    for (const s of shapes) {
      const a = area(s.outer);
      if (a < bestArea && a > area(h) && containsPoint(s.outer, p)) {
        best = s;
        bestArea = a;
      }
    }
    if (best) best.holes.push(h);
  }
  return shapes;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

function worldToLocal(p: Vec2, origin: Vec2, rotationDeg: number): Vec2 {
  const r = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: r2(dx * Math.cos(r) - dy * Math.sin(r)), y: r2(dx * Math.sin(r) + dy * Math.cos(r)) };
}

/** Closed Bézier element (keep or cut) from a contour, positioned at its centroid in the given frame. */
function bezierElement(contour: Contour, frameOrigin: Vec2, frameRotationDeg: number, mode: "cut" | "keep", errorMm: number, name: string): SectorElement | null {
  const local = contour.map((p) => worldToLocal(p, frameOrigin, frameRotationDeg));
  const cen = centroid(local);
  const rel = local.map((p) => ({ x: p.x - cen.x, y: p.y - cen.y }));
  const pts = fitClosedPolygon(rel, errorMm);
  if (pts.length < 4) return null;
  return newElement("bezier", { name, x: r2(cen.x), y: r2(cen.y), points: pts.map((p) => ({ x: r2(p.x), y: r2(p.y) })), closed: true, strokeWidth: 0, mode });
}

export function convertContours(contours: readonly TracedContour[], s0: ConvertSettings): ConversionResult {
  // Stroke-aware tolerances (line art has strokes only a few pixels wide).
  const strokePx = estimateStrokeWidth(contours);
  const tol = autoTolerances(strokePx * s0.mmPerPx, s0.simplifyMm, s0.bezierErrorMm);
  const s: ConvertSettings = { ...s0, ...tol };
  let shapesAll = shapesFromContours(contours, s.center, s.mmPerPx, s.simplifyMm);
  if (s.mode === "cells") {
    // Cells are already the paper areas between strokes; shrink them so the remaining web is at least minGap wide.
    const shrink = Math.max(0, (s.minGap - strokePx * s.mmPerPx) / 2);
    if (shrink > 0.01) {
      shapesAll = shapesAll.flatMap((sh) => flattenRegions(offset([{ outer: sh.outer, holes: sh.holes }], -shrink, "round")).map((r) => ({ outer: r.outer, holes: [...r.holes] })));
    }
  }
  let droppedSmall = 0;
  let thickened = 0;
  const shapes: Shape[] = [];
  for (const sh of shapesAll) {
    if (s.mode !== "stencil") {
      shapes.push(sh);
      continue;
    }
    const a = area(sh.outer);
    const per = perimeter(sh.outer);
    const minArea = Math.PI * (s.minHoleDiameter / 2) ** 2;
    if (a < minArea) {
      droppedSmall++;
      continue;
    }
    // Line art: thin strokes are widened to the minimum feature width instead of being dropped.
    const meanWidth = per > 0 ? (2 * a) / per : 0;
    if (meanWidth < s.minFeatureWidth) {
      const grow = (s.minFeatureWidth - meanWidth) / 2;
      const grown = flattenRegions(offset([{ outer: sh.outer, holes: sh.holes }], grow, "round"));
      if (grown.length === 0) {
        droppedSmall++;
        continue;
      }
      // Keep the biggest outer with its holes (holes smaller than the minimum hole vanish).
      const main = grown.slice().sort((p, q) => area(q.outer) - area(p.outer))[0]!;
      shapes.push({ outer: main.outer, holes: main.holes.filter((h) => area(h) >= minArea) });
      thickened++;
      continue;
    }
    shapes.push(sh);
  }
  const project = emptyProject(s.name);
  project.symmetry = s.symmetry;
  project.sheet = { width: s.sheet.width, height: s.sheet.height, outline: false, cornerRadius: 0 };
  project.center = { ...project.center, type: "none" };
  project.bridges = { ...project.bridges, auto: s.mode === "stencil" || s.mode === "cells" };
  // Positive Cutout: the dark pattern is the material that remains (the mandala is the part).
  if (s.mode === "positive") project.output = { ...project.output, polarity: "positive" };
  const maxR = shapes.reduce((m, sh) => Math.max(m, ...sh.outer.map((p) => Math.hypot(p.x, p.y))), 1);
  const centerLimit = Math.max(4, maxR * 0.08);
  const infos: ImportedElementInfo[] = [];
  const rings: Ring[] = [];

  // Central shapes (contain the center or sit within the center zone) keep their world position, repeat 1.
  const central = shapes.filter((sh) => containsPoint(sh.outer, { x: 0, y: 0 }) || Math.hypot(centroid(sh.outer).x, centroid(sh.outer).y) < centerLimit);
  const rest = shapes.filter((sh) => !central.includes(sh));
  if (central.length > 0) {
    const ring: Ring = { id: newId("r"), name: "Center (imported)", visible: true, radius: 0, repeat: 1, phase: 0, mirrorLocal: false, elements: [] };
    for (const sh of central) {
      const el = bezierElement(sh.outer, { x: 0, y: 0 }, 0, "cut", s.bezierErrorMm, "center shape");
      if (!el) continue;
      el.children = sh.holes.map((h, i) => bezierElement(h, { x: el.x, y: el.y }, 0, "keep", s.bezierErrorMm, `hole ${i + 1}`)).filter((c): c is SectorElement => c !== null);
      if (el.children.length === 0) delete el.children;
      ring.elements.push(el);
      infos.push({ id: el.id, ringId: ring.id, type: "bezier", detectedType: "center", confidence: 1, areaMm2: r2(area(sh.outer)) });
    }
    if (ring.elements.length > 0) rings.push(ring);
  }

  // Radial clusters first (world space), then one representative sector per cluster with that band's symmetry.
  const restItems = rest.map((sh, i) => {
    const rs = sh.outer.map((p) => Math.hypot(p.x, p.y));
    const c = centroid(sh.outer);
    return { index: i, radius: Math.hypot(c.x, c.y), span: Math.max(...rs) - Math.min(...rs) };
  });
  const clustering = s.ringDetect ? clusterRings(restItems, maxR) : { rings: restItems.length ? [{ radius: restItems.reduce((a, it) => a + it.radius, 0) / restItems.length, min: 0, max: 0, members: restItems.map((it) => it.index) }] : [], free: [] as number[] };
  const bandFor = (radius: number): BandSetting | null => {
    if (!s.bands || s.bands.length === 0) return null;
    return s.bands.find((b) => radius >= b.rMinMm && radius < b.rMaxMm) ?? s.bands.reduce((a, b) => (Math.abs((b.rMinMm + b.rMaxMm) / 2 - radius) < Math.abs((a.rMinMm + a.rMaxMm) / 2 - radius) ? b : a));
  };
  const groups: { name: string; radius: number; members: number[]; n: number; phase: number; mirror: boolean }[] = [];
  const unmatchedAll: number[] = [...clustering.free];
  const pushGroup = (name: string, radius: number, members: number[]): void => {
    const band = bandFor(radius);
    const n = band ? band.n : s.symmetry;
    const axis = band && band.mirrorAxisDeg !== null ? band.mirrorAxisDeg : s.mirror ? s.phaseDeg : null;
    groups.push({ name, radius, members, n, phase: axis ?? s.phaseDeg, mirror: axis !== null });
  };
  clustering.rings.forEach((c, i) => pushGroup(`Ring ${i + 1} (imported)`, c.radius, c.members));
  const sectorAngleOf = (n: number): number => 360 / n;
  type SectorShape = { outer: Contour; holes: Contour[]; radius: number; span: number };
  const groupShapes: { g: (typeof groups)[number]; shapes: SectorShape[] }[] = [];
  for (const g of groups) {
    const members = g.members.map((i) => rest[i]!);
    const { picks, unmatched } = pickSectorContours(members.map((sh) => sh.outer), g.n, g.phase, g.mirror);
    for (const u of unmatched) unmatchedAll.push(g.members[u]!);
    const sectorAngle = sectorAngleOf(g.n);
    const shapes: SectorShape[] = [];
    for (const pk of picks) {
      const pc = centroid(pk.contour);
      let src: Shape | undefined;
      let srcRot = 0;
      for (const sh of members) {
        const c = centroid(sh.outer);
        const ang = ((Math.atan2(c.y, c.x) * 180) / Math.PI + 90 + 720) % 360;
        const k = Math.round((ang - pk.assignment.angleDeg) / sectorAngle);
        const rot = rotateContour([c], -k * sectorAngle)[0]!;
        if (Math.hypot(rot.x - pc.x, rot.y - pc.y) < 1e-6) {
          src = sh;
          srcRot = k * sectorAngle;
          break;
        }
      }
      const holes = src ? src.holes.map((h) => rotateContour(h, -srcRot)) : [];
      const rs = pk.contour.map((p) => Math.hypot(p.x, p.y));
      shapes.push({ outer: pk.contour, holes, radius: pk.assignment.radius, span: Math.max(...rs) - Math.min(...rs) });
    }
    groupShapes.push({ g, shapes });
  }
  const unmatched = [...new Set(unmatchedAll)];
  if (unmatched.length > 0) {
    const ring: Ring = { id: newId("r"), name: "Unmatched shapes (world)", visible: true, radius: 0, repeat: 1, phase: 0, mirrorLocal: false, elements: [] };
    for (const idx of unmatched) {
      const sh = rest[idx]!;
      const el = bezierElement(sh.outer, { x: 0, y: 0 }, 0, "cut", s.bezierErrorMm, "shape (world)");
      if (!el) continue;
      const children = sh.holes.map((h, i) => bezierElement(h, { x: el.x, y: el.y }, 0, "keep", s.bezierErrorMm, `hole ${i + 1}`)).filter((c): c is SectorElement => c !== null);
      if (children.length > 0) el.children = children;
      el.imported = { detectedType: "unmatched", confidence: 1 };
      ring.elements.push(el);
      infos.push({ id: el.id, ringId: ring.id, type: "bezier", detectedType: "unmatched", confidence: 1, areaMm2: r2(area(sh.outer)) });
    }
    if (ring.elements.length > 0) rings.push(ring);
  }
  const sectorShapesCount = groupShapes.reduce((n, gs) => n + gs.shapes.length, 0);

  let recognized = 0;
  let lowConfidence = 0;
  for (const { g, shapes: sectorShapes } of groupShapes) {
    if (sectorShapes.length === 0) continue;
    const R = r2(sectorShapes.reduce((a, sh) => a + sh.radius, 0) / sectorShapes.length);
    const t: Transform = instanceTransform(0, { count: g.n, radius: R, phaseDeg: g.phase, rotationDeg: 0, rotationMode: "radial", direction: "outward", stagger: 0 });
    const sectorRotDeg = (t.rotation * 180) / Math.PI;
    const ring: Ring = { id: newId("r"), name: `${g.name} ×${g.n}`, visible: true, radius: R, repeat: g.n, phase: r2(g.phase), mirrorLocal: g.mirror, elements: [] };
    for (const sh of sectorShapes) {
      const world = sh.outer;
      const rec = s.recognize && sh.holes.length === 0 ? recognizePrimitive(world) : null;
      let el: SectorElement | null = null;
      if (rec && rec.type !== "bezier") {
        const c = invertTransform(rec.frame.center, t);
        el = newElement(rec.type, {
          name: rec.type,
          x: r2(c.x),
          y: r2(c.y),
          rotation: r2(rec.rotationDeg - sectorRotDeg),
          length: r2(rec.type === "dot" ? rec.frame.width : rec.frame.length),
          width: r2(rec.frame.width),
          params: rec.params,
        });
        el.imported = { detectedType: rec.type, confidence: r2(rec.confidence) };
        recognized++;
      } else {
        const sectorPts = world.map((p) => invertTransform(p, t));
        const cen = centroid(sectorPts);
        const rel = sectorPts.map((p) => ({ x: p.x - cen.x, y: p.y - cen.y }));
        const pts = fitClosedPolygon(simplifyContour(rel), s.bezierErrorMm);
        if (pts.length < 4) continue;
        el = newElement("bezier", { name: "traced shape", x: r2(cen.x), y: r2(cen.y), points: pts.map((p) => ({ x: r2(p.x), y: r2(p.y) })), closed: true, strokeWidth: 0 });
        el.imported = { detectedType: "bezier", confidence: r2(rec ? Math.max(rec.confidence, 0.5) : 1) };
        if (rec && rec.confidence < RECOGNITION_ACCEPT * 0.8) lowConfidence++;
        if (sh.holes.length > 0) {
          const children = sh.holes
            .map((h, i) => bezierElement(h.map((p) => invertTransform(p, t)), { x: el!.x, y: el!.y }, 0, "keep", s.bezierErrorMm, `hole ${i + 1}`))
            .filter((c): c is SectorElement => c !== null);
          if (children.length > 0) el.children = children;
        }
      }
      ring.elements.push(el);
      infos.push({ id: el.id, ringId: ring.id, type: el.type, detectedType: el.imported?.detectedType ?? el.type, confidence: el.imported?.confidence ?? 1, areaMm2: r2(area(world)) });
    }
    if (ring.elements.length > 0) rings.push(ring);
  }
  project.rings = rings;
  return {
    project,
    elements: infos,
    stats: { contours: contours.length, sectorContours: sectorShapesCount, centerContours: central.length, rings: rings.length, elements: infos.length, unmatched: unmatched.length, recognized, lowConfidence, droppedSmall, thickened },
  };
}
