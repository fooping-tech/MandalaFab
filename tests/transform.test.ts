import { describe, it, expect } from "vitest";
import { applyTransform, invertTransform, polarToPoint, pointAngleDeg, transformContour } from "../src/geometry/radial/transform";
import { rotate, signedArea } from "../src/geometry/vec";

describe("coordinate transform", () => {
  it("apply then invert is identity", () => {
    const t = { tx: 12.5, ty: -7, rotation: 1.234 };
    const p = { x: 3, y: 4 };
    const q = invertTransform(applyTransform(p, t), t);
    expect(q.x).toBeCloseTo(p.x, 9);
    expect(q.y).toBeCloseTo(p.y, 9);
  });

  it("rotation is applied before translation", () => {
    const t = { tx: 10, ty: 0, rotation: Math.PI / 2 };
    const p = applyTransform({ x: 1, y: 0 }, t);
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });

  it("polar helpers use 0° = top, clockwise on screen", () => {
    const top = polarToPoint(10, 0);
    expect(top.x).toBeCloseTo(0, 9);
    expect(top.y).toBeCloseTo(-10, 9);
    const right = polarToPoint(10, 90);
    expect(right.x).toBeCloseTo(10, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(pointAngleDeg(right)).toBeCloseTo(90, 9);
    expect(pointAngleDeg(top)).toBeCloseTo(0, 9);
  });

  it("rigid transforms preserve area and orientation", () => {
    const c = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ];
    const t = transformContour(c, { tx: -3, ty: 9, rotation: 0.7 });
    expect(signedArea(t)).toBeCloseTo(signedArea(c), 9);
    expect(rotate({ x: 1, y: 0 }, Math.PI / 2).y).toBeCloseTo(1, 9);
  });
});
