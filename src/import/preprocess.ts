/**
 * Step 1: preprocessing. Grayscale → contrast → blur → threshold (Otsu / manual /
 * adaptive) → invert → denoise. Works for white-on-black and black-on-white input:
 * the background is estimated from the image border and the result always has
 * ink = 1.
 */
import type { BinaryImage, GrayImage, RgbaImage } from "./types";

export interface PreprocessOptions {
  /** Contrast multiplier around mid grey (1 = unchanged). */
  contrast: number;
  /** Blur radius in pixels (0 = none). */
  blur: number;
  /** Threshold 0..1, or "auto" for Otsu. */
  threshold: number | "auto";
  /** Adaptive (local mean) thresholding instead of a global level. */
  adaptive: boolean;
  /** Flip ink / background after the automatic background detection. */
  invert: boolean;
  /** Morphological open+close radius to remove specks (0 = none). */
  denoise: number;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = { contrast: 1, blur: 0, threshold: "auto", adaptive: false, invert: false, denoise: 0 };

export function toGray(img: RgbaImage): GrayImage {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3]! / 255;
    // Transparent pixels count as white paper.
    const lum = (0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!) / 255;
    out[i] = lum * a + (1 - a);
  }
  return { width: img.width, height: img.height, data: out };
}

export function applyContrast(g: GrayImage, contrast: number): GrayImage {
  if (Math.abs(contrast - 1) < 1e-6) return g;
  const out = new Float32Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, 0.5 + (g.data[i]! - 0.5) * contrast));
  return { width: g.width, height: g.height, data: out };
}

/** Separable box blur applied twice (≈ Gaussian). */
export function boxBlur(g: GrayImage, radius: number): GrayImage {
  const r = Math.round(radius);
  if (r <= 0) return g;
  const { width: w, height: h } = g;
  let src = g.data;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / (2 * r + 1);
        const add = Math.min(w - 1, x + r + 1);
        const rem = Math.max(0, x - r);
        sum += src[y * w + add]! - src[y * w + rem]!;
      }
    }
    const out = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / (2 * r + 1);
        const add = Math.min(h - 1, y + r + 1);
        const rem = Math.max(0, y - r);
        sum += tmp[add * w + x]! - tmp[rem * w + x]!;
      }
    }
    src = out;
  }
  return { width: w, height: h, data: src };
}

/** Otsu's threshold on a 256-bin histogram. */
export function otsuThreshold(g: GrayImage): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.data.length; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(g.data[i]! * 255)));
    hist[bin] = hist[bin]! + 1;
  }
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  // Bins <= t are the dark class, so the level sits just above bin t.
  return (threshold + 0.5) / 255;
}

/** Mean luminance of a 2 % border: > 0.5 means a light background (dark ink). */
export function backgroundIsLight(g: GrayImage): boolean {
  const { width: w, height: h } = g;
  const b = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < b || y < b || x >= w - b || y >= h - b) {
        sum += g.data[y * w + x]!;
        n++;
      }
    }
  }
  return n === 0 || sum / n > 0.5;
}

/** Integral image for local means. */
function integral(g: GrayImage): Float64Array {
  const { width: w, height: h } = g;
  const s = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g.data[(y - 1) * w + (x - 1)]!;
      s[y * (w + 1) + x] = s[(y - 1) * (w + 1) + x]! + row;
    }
  }
  return s;
}

export function threshold(g: GrayImage, level: number, inkIsDark: boolean, adaptive: boolean): BinaryImage {
  const { width: w, height: h } = g;
  const out = new Uint8Array(w * h);
  if (!adaptive) {
    for (let i = 0; i < out.length; i++) {
      const v = g.data[i]!;
      out[i] = (inkIsDark ? v < level : v > level) ? 1 : 0;
    }
    return { width: w, height: h, data: out };
  }
  const s = integral(g);
  const r = Math.max(4, Math.round(Math.min(w, h) / 32));
  const c = (level - 0.5) * 0.3; // manual level shifts the local decision a little
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const mean = (s[y1 * (w + 1) + x1]! - s[y0 * (w + 1) + x1]! - s[y1 * (w + 1) + x0]! + s[y0 * (w + 1) + x0]!) / area;
      const v = g.data[y * w + x]!;
      out[y * w + x] = (inkIsDark ? v < mean - 0.08 + c : v > mean + 0.08 - c) ? 1 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

function morph(b: BinaryImage, radius: number, dilate: boolean): BinaryImage {
  const { width: w, height: h } = b;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -radius; dy <= radius && (dilate ? !v : v); dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          if (!dilate) v = 0;
          continue;
        }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const p = xx < 0 || xx >= w ? 0 : b.data[yy * w + xx]!;
          if (dilate && p) {
            v = 1;
            break;
          }
          if (!dilate && !p) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return { width: w, height: h, data: out };
}

export const erode = (b: BinaryImage, r = 1): BinaryImage => morph(b, r, false);
export const dilate = (b: BinaryImage, r = 1): BinaryImage => morph(b, r, true);

/** Morphological open then close: removes specks and fills pinholes. */
export function denoise(b: BinaryImage, radius: number): BinaryImage {
  if (radius <= 0) return b;
  const opened = dilate(erode(b, radius), radius);
  return erode(dilate(opened, radius), radius);
}

export interface PreprocessResult {
  gray: GrayImage;
  binary: BinaryImage;
  /** Otsu level that was (or would be) used. */
  autoThreshold: number;
  backgroundLight: boolean;
  inkPixels: number;
}

export function preprocess(img: RgbaImage, opts: PreprocessOptions): PreprocessResult {
  let gray = toGray(img);
  gray = applyContrast(gray, opts.contrast);
  gray = boxBlur(gray, opts.blur);
  const autoThreshold = otsuThreshold(gray);
  const level = opts.threshold === "auto" ? autoThreshold : opts.threshold;
  const backgroundLight = backgroundIsLight(gray);
  const inkIsDark = backgroundLight !== opts.invert;
  let binary = threshold(gray, level, inkIsDark, opts.adaptive);
  binary = denoise(binary, Math.round(opts.denoise));
  let inkPixels = 0;
  for (let i = 0; i < binary.data.length; i++) inkPixels += binary.data[i]!;
  return { gray, binary, autoThreshold, backgroundLight, inkPixels };
}

/** Nearest-neighbour downscale of a binary image to at most `max` pixels on the long side. */
export function downscaleBinary(b: BinaryImage, max: number, mode: "majority" | "max" = "max"): { image: BinaryImage; scale: number } {
  const scale = Math.min(1, max / Math.max(b.width, b.height));
  if (scale >= 1) return { image: b, scale: 1 };
  const w = Math.max(1, Math.round(b.width * scale));
  const h = Math.max(1, Math.round(b.height * scale));
  const out = new Uint8Array(w * h);
  const inv = 1 / scale;
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * inv);
    const sy1 = Math.min(b.height, Math.floor((y + 1) * inv));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * inv);
      const sx1 = Math.min(b.width, Math.floor((x + 1) * inv));
      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.max(sy0 + 1, sy1); sy++) for (let sx = sx0; sx < Math.max(sx0 + 1, sx1); sx++) {
        sum += b.data[sy * b.width + sx] ?? 0;
        n++;
      }
      out[y * w + x] = mode === "max" ? (sum > 0 ? 1 : 0) : sum * 2 >= n ? 1 : 0;
    }
  }
  return { image: { width: w, height: h, data: out }, scale };
}

/** Crop a region (pixel rect) out of an RGBA image. */
export function cropImage(img: RgbaImage, x: number, y: number, w: number, h: number): RgbaImage {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(img.width - x0, Math.round(w)));
  const ch = Math.max(1, Math.min(img.height - y0, Math.round(h)));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) out.set(img.data.subarray(((y0 + row) * img.width + x0) * 4, ((y0 + row) * img.width + x0 + cw) * 4), row * cw * 4);
  return { width: cw, height: ch, data: out };
}
