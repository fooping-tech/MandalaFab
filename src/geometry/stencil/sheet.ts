import type { Sheet } from "../../model/project";
import type { Contour, Region } from "../types";
import { arcPoints } from "../vec";
import { TOLERANCE } from "../types";

/** Sheet outline centred on the origin (design coordinates have the mandala center at 0,0). */
export function sheetContour(sheet: Sheet): Contour {
  const w = sheet.width / 2;
  const h = sheet.height / 2;
  const r = Math.min(sheet.cornerRadius, w, h);
  if (r <= 0) {
    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ];
  }
  const q = Math.PI / 2;
  return [
    ...arcPoints({ x: w - r, y: -h + r }, r, -q, q, TOLERANCE),
    ...arcPoints({ x: w - r, y: h - r }, r, 0, q, TOLERANCE),
    ...arcPoints({ x: -w + r, y: h - r }, r, q, q, TOLERANCE),
    ...arcPoints({ x: -w + r, y: -h + r }, r, 2 * q, q, TOLERANCE),
  ];
}

export const sheetRegion = (sheet: Sheet): Region => ({ outer: sheetContour(sheet), holes: [] });
