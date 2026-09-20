import { describe, expect, it } from "vitest";
import "../src/geometry/motifs";
import { buildArch, buildFan, buildZigzag } from "../src/geometry/elements/builders";
import { getMotif, resolveParams } from "../src/geometry/motifs";
import { signedArea } from "../src/geometry/vec";
import { newElement } from "../src/model/project";
import { elementLocalRegions } from "../src/geometry/elements/sector";
import { PRESETS, loadPreset } from "../src/presets";
import { computeRender } from "../src/editor/pipeline";

const bounds = (pts: readonly { x: number; y: number }[]) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, maxX, minY, maxY };
};

describe("arch / fan / zigzag builders", () => {
  it("arch fills its length × width box and is mirror-symmetric about the x axis", () => {
    const c = buildArch(19, 15, 0.55, 0.02);
    expect(c.length).toBeGreaterThan(10);
    const b = bounds(c);
    expect(b.maxX - b.minX).toBeCloseTo(19, 1);
    expect(b.maxY - b.minY).toBeCloseTo(15, 1);
    expect(Math.abs(b.maxY + b.minY)).toBeLessThan(0.05);
    // a pointed arch is narrower at the tip than at the base
    const round = buildArch(19, 15, 0, 0.02);
    expect(Math.abs(signedArea(c))).toBeLessThan(Math.abs(signedArea(round)));
  });

  it("fan subtracts spokes and the eye, leaving several separate segments", () => {
    const solid = buildFan(19, 18, { pointed: 0.4, spokes: 0, spokeWidth: 1.2, eye: 0, rim: 0 }, 0.02);
    const fan = buildFan(19, 18, { pointed: 0.4, spokes: 6, spokeWidth: 1.2, eye: 0.3, rim: 1.5 }, 0.02);
    expect(solid.length).toBe(1);
    expect(fan.length).toBeGreaterThanOrEqual(6);
    const area = (cs: typeof fan) => cs.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
    expect(area(fan)).toBeLessThan(area(solid) * 0.8);
  });

  it("zigzag polyline has waves+1 direction changes and spans the length", () => {
    const line = buildZigzag(22, 6, 2);
    expect(line.length).toBe(2 * 2 + 1);
    const b = bounds(line);
    expect(b.maxX - b.minX).toBeCloseTo(22, 5);
    expect(b.maxY - b.minY).toBeCloseTo(6, 5);
  });

  it("zigzag element becomes one band region", () => {
    const el = newElement("zigzag", { length: 22, width: 6, strokeWidth: 2.2, params: { waves: 2, tip: 1 } });
    const regs = elementLocalRegions(el, 40, 1, []);
    expect(regs.length).toBe(1);
    expect(regs[0]!.holes.length).toBe(0);
  });
});

describe("Ainu motifs", () => {
  it("morew is a single spiral band with a thorn when requested", () => {
    const m = getMotif("morew")!;
    const plain = m.build({ length: 18, width: 11, ringRadius: 40, tolerance: 0.02, params: resolveParams(m, { turns: 1, thorn: 0 }) });
    const thorned = m.build({ length: 18, width: 11, ringRadius: 40, tolerance: 0.02, params: resolveParams(m, { turns: 1, thorn: 0.6 }) });
    expect(plain.closed.length).toBe(2); // band + round head
    expect(thorned.closed.length).toBe(3);
    for (const c of plain.closed) expect(signedArea(c)).toBeGreaterThan(0);
    const b = bounds(plain.closed.flat());
    expect(b.maxX - b.minX).toBeLessThanOrEqual(18.5);
    expect(b.maxY - b.minY).toBeLessThanOrEqual(11.5);
  });

  it("morew spiral keeps a gap between turns (no enclosed pocket → no hole after union)", () => {
    const el = newElement("shape", { motif: "morew", length: 18, width: 11, params: { turns: 1.5, thorn: 0, direction: 1, gap: 1.2 } });
    const regs = elementLocalRegions(el, 40, 1, []);
    expect(regs.every((r) => r.holes.length === 0)).toBe(true);
  });

  it("uren-morew is symmetric about the x axis", () => {
    const m = getMotif("urenmorew")!;
    const s = m.build({ length: 23, width: 21, ringRadius: 40, tolerance: 0.02, params: resolveParams(m, {}) });
    expect(s.closed.length).toBe(3);
    const b = bounds(s.closed.flat());
    expect(Math.abs(b.maxY + b.minY)).toBeLessThan(0.05);
  });
});

describe("pattern presets", () => {
  it.each(["arch-lace", "scallop-fan-lace", "ainu-morew", "ethnic-border"])("%s renders, bridges every island and passes validation", (id) => {
    expect(PRESETS.some((p) => p.id === id)).toBe(true);
    const r = computeRender(loadPreset(id));
    expect(r.counts.subpaths).toBeGreaterThan(100);
    expect(r.counts.islands).toBe(0);
    expect(r.validation?.ok).toBe(true);
  }, 120000);
});
