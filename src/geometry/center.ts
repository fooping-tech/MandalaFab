/**
 * Center motif generators: radial petal flowers built in world coordinates.
 */
import type { CenterMotif } from "../model/project";
import { flattenRegions, strokeClosed } from "./boolean";
import { buildLeaf, buildPetal, buildTeardrop } from "./elements/builders";
import { radialRepeatRegions } from "./radial/repeat";
import type { Contour, Region } from "./types";
import { TOLERANCE } from "./types";
import { arcSegments } from "./vec";

function disc(r: number): Contour {
  const n = Math.max(16, arcSegments(r, Math.PI * 2, TOLERANCE));
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: Math.cos((i / n) * Math.PI * 2) * r, y: Math.sin((i / n) * Math.PI * 2) * r });
  return pts;
}

function ring(contour: Contour, strokeWidth: number): Region[] {
  return strokeWidth > 0 ? flattenRegions(strokeClosed(contour, strokeWidth)) : [{ outer: contour, holes: [] }];
}

function place(shape: Contour, count: number, radius: number, phaseDeg: number, strokeWidth: number): Region[] {
  const local = ring(shape, strokeWidth);
  return radialRepeatRegions(local, { count, radius, phaseDeg, rotationDeg: 0, rotationMode: "radial", direction: "outward", stagger: 0 }).flatMap((i) => i.regions);
}

export function buildCenter(c: CenterMotif): Region[] {
  if (c.type === "none") return [];
  const out: Region[] = [];
  const inner = Math.min(c.innerRadius, c.outerRadius - 0.5);
  const L = Math.max(0.5, c.outerRadius - inner);
  const mid = inner + L / 2;
  const W = c.petalWidth;
  switch (c.type) {
    case "radialPetals":
      out.push(...place(buildPetal(L, W, 1, 0.35, TOLERANCE), c.petals, mid, c.rotation, c.strokeWidth));
      break;
    case "circularPetals":
      out.push(...place(buildTeardrop(L, W, 0, 0, TOLERANCE), c.petals, mid, c.rotation, c.strokeWidth));
      break;
    case "starburst":
      out.push(
        ...place(
          [
            { x: L / 2, y: 0 },
            { x: -L / 2, y: W / 2 },
            { x: -L / 2, y: -W / 2 },
          ],
          c.petals,
          mid,
          c.rotation,
          c.strokeWidth,
        ),
      );
      break;
    case "sunflower": {
      const L1 = L * 0.62;
      out.push(...place(buildLeaf(L1, W, 0.8, 0, TOLERANCE), c.petals, inner + L1 / 2, c.rotation, c.strokeWidth));
      const L2 = L * 0.55;
      out.push(...place(buildLeaf(L2, W * 0.9, 0.8, 0, TOLERANCE), c.petals, c.outerRadius - L2 / 2, c.rotation + 180 / c.petals, c.strokeWidth));
      const d = Math.max(0.8, W * 0.35);
      out.push(...place(disc(d / 2), c.petals, c.outerRadius + d, c.rotation, 0));
      break;
    }
  }
  if (c.coreRadius > 0) out.push(...ring(disc(c.coreRadius), c.strokeWidth));
  return out;
}
