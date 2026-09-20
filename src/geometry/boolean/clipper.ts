/**
 * Thin adapter over clipper-lib (Clipper 6.4.2 JS port).
 *
 * Why clipper-lib: it is the one library that gives us robust union/difference
 * AND polygon offsetting (needed for stroke bands, morphological thin-feature
 * checks and bridge generation) in pure JS, runs unchanged in Node tests and
 * Web Workers, and TypeFab has already validated it for laser-cut geometry.
 * Everything Clipper-specific lives in this file so the engine can be moved to
 * Clipper2 later without touching callers.
 *
 * Conventions:
 *  - coordinates are mm, scaled by SCALE to integers (0.1 µm resolution)
 *  - outer contours have positive `signedArea`, holes negative (matches Clipper)
 *  - unions use the *positive* fill rule so a shape's hole never punches into an
 *    unrelated overlapping shape.
 */
import ClipperLib from "clipper-lib";
import type { Contour, Polyline, Region, RegionNode, Vec2 } from "../types";
import { TOLERANCE } from "../types";
import { signedArea } from "../vec";

export const SCALE = 10000;

/** Holes smaller than this (mm²) are numerical noise, not islands. */
export const MIN_HOLE_AREA = 0.05;

type IPath = ClipperLib.IntPoint[];

function encode(c: Contour | Polyline): IPath {
  const out: IPath = new Array(c.length);
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!;
    out[i] = new ClipperLib.IntPoint(Math.round(p.x * SCALE), Math.round(p.y * SCALE));
  }
  return out;
}

function decode(p: IPath): Vec2[] {
  const out: Vec2[] = new Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = { x: p[i]!.X / SCALE, y: p[i]!.Y / SCALE };
  return out;
}

/** Orient a contour so outers are positive and holes negative. */
export function orient(c: Contour, outer: boolean): Contour {
  const a = signedArea(c);
  if (a === 0) return c;
  return (a > 0) === outer ? c : [...c].reverse();
}

/** Add regions (recursing into nested RegionNode children so nothing inside a hole is lost). */
function addRegions(clipper: ClipperLib.Clipper, regions: readonly Region[], type: ClipperLib.PolyType): void {
  for (const r of regions) {
    if (r.outer.length >= 3) clipper.AddPath(encode(orient(r.outer, true)), type, true);
    for (const h of r.holes) if (h.length >= 3) clipper.AddPath(encode(orient(h, false)), type, true);
    const children = (r as Partial<RegionNode>).children;
    if (children && children.length > 0) addRegions(clipper, children, type);
  }
}

/** Convert a Clipper PolyTree to our region tree (outer + holes + nested children). */
function treeToRegions(tree: ClipperLib.PolyTree): RegionNode[] {
  const walkOuter = (node: ClipperLib.PolyNode): RegionNode => {
    const holes: Contour[] = [];
    const children: RegionNode[] = [];
    const childHole: number[] = [];
    const holeNodes = node.Childs();
    for (let hi = 0; hi < holeNodes.length; hi++) {
      const holeNode = holeNodes[hi]!;
      const hole = decode(holeNode.Contour());
      // Degenerate holes (numerical slivers where a band touches itself) are dropped.
      if (Math.abs(signedArea(hole)) < MIN_HOLE_AREA && holeNode.Childs().length === 0) continue;
      holes.push(hole);
      for (const inner of holeNode.Childs()) {
        children.push(walkOuter(inner));
        childHole.push(holes.length - 1);
      }
    }
    return { outer: decode(node.Contour()), holes, children, childHole };
  };
  return tree.Childs().map(walkOuter);
}

const CT = ClipperLib.ClipType;
const PT = ClipperLib.PolyType;
const FT = ClipperLib.PolyFillType;

function execute(
  subject: readonly Region[],
  clip: readonly Region[],
  type: ClipperLib.ClipType,
  subjectFill: ClipperLib.PolyFillType,
  clipFill: ClipperLib.PolyFillType,
  strict = false,
): RegionNode[] {
  const clipper = new ClipperLib.Clipper();
  clipper.StrictlySimple = strict;
  addRegions(clipper, subject, PT.ptSubject);
  addRegions(clipper, clip, PT.ptClip);
  const tree = new ClipperLib.PolyTree();
  const ok = clipper.Execute(type, tree, subjectFill, clipFill);
  if (!ok) throw new Error("ブーリアン演算に失敗しました。");
  return treeToRegions(tree);
}

/** Wrap loose contours as regions (each contour is its own outer with no holes). */
export const asRegions = (contours: readonly Contour[]): Region[] => contours.map((c) => ({ outer: c, holes: [] }));

/**
 * Union of regions. Uses the positive fill rule: overlapping shapes add up and a
 * hole only survives where nothing else covers it.
 */
export function union(regions: readonly Region[], options: { strict?: boolean } = {}): RegionNode[] {
  if (regions.length === 0) return [];
  return execute(regions, [], CT.ctUnion, FT.pftPositive, FT.pftPositive, options.strict ?? false);
}

/** subject − clip. Inputs are assumed to be already-unioned region sets (no self overlap). */
export function difference(subject: readonly Region[], clip: readonly Region[]): RegionNode[] {
  if (subject.length === 0) return [];
  if (clip.length === 0) return union(subject);
  return execute(subject, clip, CT.ctDifference, FT.pftPositive, FT.pftPositive);
}

export function intersection(subject: readonly Region[], clip: readonly Region[]): RegionNode[] {
  if (subject.length === 0 || clip.length === 0) return [];
  return execute(subject, clip, CT.ctIntersection, FT.pftPositive, FT.pftPositive);
}

export type JoinStyle = "round" | "miter" | "square";

const joinOf = (j: JoinStyle): ClipperLib.JoinType =>
  j === "round" ? ClipperLib.JoinType.jtRound : j === "miter" ? ClipperLib.JoinType.jtMiter : ClipperLib.JoinType.jtSquare;

/** Offset (grow for delta > 0, shrink for delta < 0) a set of regions. */
export function offset(regions: readonly Region[], delta: number, join: JoinStyle = "round", arcTolerance = TOLERANCE): RegionNode[] {
  if (regions.length === 0) return [];
  const co = new ClipperLib.ClipperOffset(2, arcTolerance * SCALE);
  const add = (rs: readonly Region[]): void => {
    for (const r of rs) {
      if (r.outer.length >= 3) co.AddPath(encode(orient(r.outer, true)), joinOf(join), ClipperLib.EndType.etClosedPolygon);
      for (const h of r.holes) if (h.length >= 3) co.AddPath(encode(orient(h, false)), joinOf(join), ClipperLib.EndType.etClosedPolygon);
      const children = (r as Partial<RegionNode>).children;
      if (children && children.length > 0) add(children);
    }
  };
  add(regions);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * SCALE);
  return treeToRegions(tree);
}

/** Stroke an open polyline into a closed band of the given width. */
export function strokeOpen(line: Polyline, width: number, cap: "butt" | "round" = "round"): RegionNode[] {
  if (line.length < 2 || width <= 0) return [];
  const co = new ClipperLib.ClipperOffset(2, TOLERANCE * SCALE);
  co.AddPath(encode(line), ClipperLib.JoinType.jtRound, cap === "round" ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenButt);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, (width / 2) * SCALE);
  return treeToRegions(tree);
}

/** Stroke a closed contour into an outline band (annulus) of the given width. */
export function strokeClosed(contour: Contour, width: number): RegionNode[] {
  if (contour.length < 3 || width <= 0) return [];
  const co = new ClipperLib.ClipperOffset(2, TOLERANCE * SCALE);
  co.AddPath(encode(orient(contour, true)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedLine);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, (width / 2) * SCALE);
  return treeToRegions(tree);
}

/** Remove self-intersections from a single contour (returns possibly several contours). */
export function simplify(contour: Contour): Contour[] {
  return ClipperLib.Clipper.SimplifyPolygon(encode(contour), FT.pftNonZero).map(decode);
}

/** Remove near-duplicate/collinear vertices closer than `distance` mm. */
export function clean(contour: Contour, distance = 0.001): Contour {
  return decode(ClipperLib.Clipper.CleanPolygon(encode(contour), distance * SCALE));
}

/** Coarsen every contour of a region set (drops vertices closer than `distance` mm). Holes/children are kept. */
export function cleanRegions(regions: readonly Region[], distance: number): Region[] {
  const out: Region[] = [];
  const walk = (rs: readonly Region[]): void => {
    for (const r of rs) {
      const outer = clean(r.outer, distance);
      if (outer.length < 3) continue;
      out.push({ outer, holes: r.holes.map((h) => clean(h, distance)).filter((h) => h.length >= 3) });
      const children = (r as Partial<RegionNode>).children;
      if (children && children.length > 0) walk(children);
    }
  };
  walk(regions);
  return out;
}

/** Total area of a region set in mm². */
export function regionArea(regions: readonly Region[]): number {
  let a = 0;
  for (const r of regions) {
    a += Math.abs(signedArea(r.outer));
    for (const h of r.holes) a -= Math.abs(signedArea(h));
  }
  return a;
}

/** Flatten a region tree to a list of regions (depth-first). */
export function flattenRegions(nodes: readonly RegionNode[]): RegionNode[] {
  const out: RegionNode[] = [];
  const walk = (n: RegionNode): void => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/** All contours (outers and holes) from a region tree. */
export function allContours(nodes: readonly RegionNode[]): Contour[] {
  const out: Contour[] = [];
  for (const r of flattenRegions(nodes)) {
    out.push(r.outer);
    out.push(...r.holes);
  }
  return out;
}
