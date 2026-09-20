/** Raster buffers used by the import pipeline (no DOM types so it runs in a Worker and in tests). */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface GrayImage {
  width: number;
  height: number;
  /** Luminance 0..1. */
  data: Float32Array;
}

export interface BinaryImage {
  width: number;
  height: number;
  /** 1 = ink (shape), 0 = background. */
  data: Uint8Array;
}

export interface Point {
  x: number;
  y: number;
}

/** A traced contour in pixel coordinates. */
export interface TracedContour {
  points: Point[];
  /** True for holes (inner boundaries of a shape). */
  hole: boolean;
  area: number;
}
