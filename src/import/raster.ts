/**
 * Rasterise regions (mm) into a binary image — used by tests and by the
 * difference view to compare generated geometry with the reference image.
 */
import type { Region } from "../geometry/types";
import type { BinaryImage, RgbaImage } from "./types";

/** Scanline even-odd fill of outers and holes. `mmPerPx` maps pixels to mm; the image center is the origin. */
export function rasterizeRegions(regions: readonly Region[], width: number, height: number, mmPerPx: number, centerPx = { x: width / 2, y: height / 2 }): BinaryImage {
  const data = new Uint8Array(width * height);
  const contours = regions.flatMap((r) => [r.outer, ...r.holes]);
  for (let py = 0; py < height; py++) {
    const y = (py + 0.5 - centerPx.y) * mmPerPx;
    const xs: number[] = [];
    for (const c of contours) {
      for (let i = 0, n = c.length; i < n; i++) {
        const a = c[i]!;
        const b = c[(i + 1) % n]!;
        if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]! / mmPerPx + centerPx.x - 0.5));
      const x1 = Math.min(width - 1, Math.floor(xs[i + 1]! / mmPerPx + centerPx.x - 0.5));
      for (let px = x0; px <= x1; px++) data[py * width + px] = 1;
    }
  }
  return { width, height, data };
}

/** Binary → RGBA (ink dark on white). */
export function binaryToRgba(b: BinaryImage, inkDark = true): RgbaImage {
  const out = new Uint8ClampedArray(b.width * b.height * 4);
  for (let i = 0; i < b.data.length; i++) {
    const ink = b.data[i] === 1;
    const v = ink === inkDark ? 20 : 245;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: b.width, height: b.height, data: out };
}

/** Intersection-over-union of two binary images of equal size. */
export function binaryIoU(a: BinaryImage, b: BinaryImage): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i]!;
    const y = b.data[i] ?? 0;
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni === 0 ? 1 : inter / uni;
}
