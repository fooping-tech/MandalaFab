import type { Contour, Vec2 } from "../types";

/** Rigid transform: rotate by `rotation` (radians) about the origin, then translate. */
export interface Transform {
  readonly tx: number;
  readonly ty: number;
  readonly rotation: number;
}

export function applyTransform(p: Vec2, t: Transform): Vec2 {
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  return { x: p.x * c - p.y * s + t.tx, y: p.x * s + p.y * c + t.ty };
}

export function invertTransform(p: Vec2, t: Transform): Vec2 {
  const x = p.x - t.tx;
  const y = p.y - t.ty;
  const c = Math.cos(-t.rotation);
  const s = Math.sin(-t.rotation);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function transformContour(c: Contour, t: Transform): Vec2[] {
  const out: Vec2[] = new Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = applyTransform(c[i]!, t);
  return out;
}

/** Convert polar coordinates (angle in degrees, 0 = top, clockwise on screen) to a point. */
export function polarToPoint(radius: number, angleDeg: number): Vec2 {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

/** Angle in degrees (0 = top, clockwise on screen) of a point seen from the origin. */
export function pointAngleDeg(p: Vec2): number {
  return (Math.atan2(p.y, p.x) * 180) / Math.PI + 90;
}
