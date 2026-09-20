import { describe, it, expect } from "vitest";
import { radialRepeat, instanceTransform, instanceAngle } from "../src/geometry/radial/repeat";
import { applyTransform } from "../src/geometry/radial/transform";
import { rotate, centroid, dist, area } from "../src/geometry/vec";

const square = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];
const base = { count: 8, radius: 40, phaseDeg: 0, rotationDeg: 0, rotationMode: "radial" as const, direction: "outward" as const, stagger: 0 };

describe("radial repeat", () => {
  it("places `count` copies at the requested radius", () => {
    const inst = radialRepeat({ closed: [square], open: [] }, base);
    expect(inst).toHaveLength(8);
    for (const i of inst) {
      const c = centroid(i.closed[0]!);
      expect(Math.hypot(c.x, c.y)).toBeCloseTo(40, 6);
      expect(area(i.closed[0]!)).toBeCloseTo(4, 6);
    }
  });

  it("first copy sits at the top (12 o'clock) with phase 0", () => {
    const inst = radialRepeat({ closed: [square], open: [] }, base);
    const c = centroid(inst[0]!.closed[0]!);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(-40, 6);
  });

  it("copies are exact rotations of each other (k-fold symmetry)", () => {
    const tip = { x: 3, y: 0.5 };
    const inst = radialRepeat({ closed: [[tip, { x: -1, y: 1 }, { x: -1, y: -1 }]], open: [] }, base);
    const step = (2 * Math.PI) / 8;
    for (let i = 0; i < 8; i++) {
      const expected = rotate(inst[0]!.closed[0]![0]!, step * i);
      expect(dist(expected, inst[i]!.closed[0]![0]!)).toBeLessThan(1e-9);
    }
  });

  it("phase offset rotates all copies", () => {
    expect(instanceAngle(0, 8, 22.5)).toBe(22.5);
    expect(instanceAngle(1, 8, 22.5)).toBe(67.5);
    const t = instanceTransform(0, { ...base, phaseDeg: 90 });
    expect(t.tx).toBeCloseTo(40, 6);
    expect(t.ty).toBeCloseTo(0, 6);
  });

  it("radial mode points +x outward, inward flips it", () => {
    const outward = instanceTransform(0, base);
    const tipOut = applyTransform({ x: 1, y: 0 }, outward);
    expect(Math.hypot(tipOut.x, tipOut.y)).toBeCloseTo(41, 6);
    const inward = instanceTransform(0, { ...base, direction: "inward" });
    const tipIn = applyTransform({ x: 1, y: 0 }, inward);
    expect(Math.hypot(tipIn.x, tipIn.y)).toBeCloseTo(39, 6);
  });

  it("fixed mode keeps the motif orientation", () => {
    const t = instanceTransform(2, { ...base, rotationMode: "fixed" });
    expect(t.rotation).toBeCloseTo(0, 9);
  });

  it("stagger pushes odd copies outward", () => {
    const inst = radialRepeat({ closed: [square], open: [] }, { ...base, stagger: 5 });
    expect(Math.hypot(centroid(inst[0]!.closed[0]!).x, centroid(inst[0]!.closed[0]!).y)).toBeCloseTo(40, 6);
    expect(Math.hypot(centroid(inst[1]!.closed[0]!).x, centroid(inst[1]!.closed[0]!).y)).toBeCloseTo(45, 6);
  });
});
