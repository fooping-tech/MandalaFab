/**
 * Positive-mode checks: the mandala itself is the part, so the questions are
 * "does it hold together?" and "will thin parts survive?". Reports what the
 * checks found; it never claims the part is safe.
 */
import type { Constraints } from "../model/project";
import { cleanRegions, difference, flattenRegions, offset, regionArea } from "../geometry/boolean";
import { closestPoints, strayComponents, type OutputGeometry } from "../geometry/stencil/output";
import { sheetRegion } from "../geometry/stencil/sheet";
import { contourExtent } from "../geometry/stencil/islands";
import type { Contour, RegionNode } from "../geometry/types";
import { area, bounds, perimeter } from "../geometry/vec";
import { erosionCheck, type Severity, type ValidationIssue, type ValidationResult, type ValidationStats, type IssueCode } from "./validate";

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

export interface PositiveValidateInput {
  output: OutputGeometry;
  constraints: Constraints;
  minConnectionWidth: number;
  sheet: { width: number; height: number; outline: boolean; cornerRadius: number };
}

export function validatePositive(input: PositiveValidateInput): ValidationResult {
  const { output, constraints } = input;
  const w = Math.max(0.1, input.minConnectionWidth);
  const issues: ValidationIssue[] = [];
  let n = 0;
  const push = (code: IssueCode, severity: Severity, message: string, contours: Contour[] = []): void => {
    issues.push({ id: `${code}-${n++}`, code, severity, message, contours });
  };

  const material = flattenRegions(output.materialGeometry);
  if (material.length === 0) {
    push("empty", "info", "残る材料がありません。リングを追加してください。");
    return { ok: true, issues, stats: { regions: 0, islands: 0, bridges: 0, cutLength: 0, apertureArea: 0 } };
  }

  // 1. Connectivity: every extra component is a separate part that falls apart.
  const comps = output.components;
  const stray = strayComponents(comps);
  const isolated = stray.filter((c) => c.extent < 3 * w);
  const nested = stray.filter((c) => c.nested && c.extent >= 3 * w);
  const other = stray.filter((c) => !isolated.includes(c) && !nested.includes(c));
  if (isolated.length > 0) push("isolated-ornament", "error", `孤立した小さな飾りが ${isolated.length} 個あります（幅 ${fmt(3 * w)} mm 未満で他の材料に繋がっていません）。コネクタで繋ぐか削除してください。`, isolated.map((c) => c.region.outer));
  if (nested.length > 0) push("unsupported-island", "error", `穴の中に浮いた材料が ${nested.length} 個あります（周囲と繋がっていないので脱落します）。`, nested.map((c) => c.region.outer));
  if (other.length > 0) push("disconnected", "error", `材料が ${other.length + 1} 個の部品に分かれています。自動コネクタで繋がらなかった部品を近づけるか、コネクタ要素で繋いでください。`, other.map((c) => c.region.outer));

  // 2. Near-touching pieces: they look connected but are not (e.g. 0.2 mm gap).
  if (stray.length > 0 && comps.length <= 80) {
    const coarse = comps.map((c) => cleanRegions([{ outer: c.region.outer, holes: c.region.holes }], 0.2)[0] ?? { outer: c.region.outer, holes: c.region.holes });
    const near: Contour[] = [];
    let minGapSeen = Infinity;
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        const bi = bounds([coarse[i]!.outer]);
        const bj = bounds([coarse[j]!.outer]);
        const gap = Math.hypot(Math.max(0, Math.max(bi.minX, bj.minX) - Math.min(bi.maxX, bj.maxX)), Math.max(0, Math.max(bi.minY, bj.minY) - Math.min(bi.maxY, bj.maxY)));
        if (gap > constraints.minGap) continue;
        const r = closestPoints(coarse[i]!, coarse[j]!);
        if (r.d < constraints.minGap) {
          minGapSeen = Math.min(minGapSeen, r.d);
          const m = { x: (r.p.x + r.q.x) / 2, y: (r.p.y + r.q.y) / 2 };
          const s = Math.max(1, constraints.minGap);
          near.push([{ x: m.x - s, y: m.y - s }, { x: m.x + s, y: m.y - s }, { x: m.x + s, y: m.y + s }, { x: m.x - s, y: m.y + s }]);
        }
      }
    }
    if (near.length > 0) push("narrow-gap", "warning", `見た目は繋がって見えるのに実際は離れている箇所が ${near.length} 箇所あります（最小 ${fmt(minGapSeen)} mm の隙間）。接続幅を上げるか要素を重ねてください。`, near.slice(0, 60));
  }

  // 3. Thin necks / fragile tips at the minimum connection width: one opening
  //    (erode + dilate) with round joins — square joins are pathologically slow on
  //    this kind of geometry — classifies slivers as necks (topology changes) or tips.
  const morph = { join: "round" as const, arcTolerance: 0.3, clean: 0.25 };
  const flat = cleanRegions(material, Math.min(morph.clean, w / 10)).map((r) => ({ ...r, children: [], childHole: [] }) as RegionNode);
  const eroded = flattenRegions(offset(flat, -w / 2, morph.join, morph.arcTolerance));
  const opened = flattenRegions(offset(eroded, w / 2, morph.join, morph.arcTolerance));
  const slivers = flattenRegions(difference(flat, opened)).map((s) => s.outer);
  const holesBefore = flat.reduce((k, r) => k + r.holes.length, 0);
  const holesAfter = eroded.reduce((k, r) => k + r.holes.length, 0);
  const topologyChanges = Math.max(0, eroded.length - flat.length) + Math.max(0, holesBefore - holesAfter);
  const big = slivers.filter((s) => area(s) >= 0.6 * w * w && contourExtent(s) >= 2 * w).sort((a, b) => area(b) - area(a));
  if (topologyChanges > 0) {
    // Necks: the largest elongated slivers (a neck is a sliver wider than it is thick, connecting two sides).
    const necks = big.filter((s) => contourExtent(s) >= 2.5 * w).slice(0, 40);
    if (necks.length > 0) push("thin-neck", "warning", `最小接続幅 ${fmt(w)} mm より細いくびれが ${necks.length} 箇所あります（そこで折れる可能性）。`, necks);
    else push("thin-neck", "info", `最小接続幅 ${fmt(w)} mm で材料を細らせると分離する箇所があります（${topologyChanges} 箇所）。`);
    const tips = big.filter((s) => !necks.includes(s)).slice(0, 40);
    if (tips.length > 0) push("fragile-tip", "warning", `最小接続幅 ${fmt(w)} mm より細い先端・縁が ${tips.length} 箇所あります（折れやすい）。`, tips);
  } else if (big.length > 0) {
    push("fragile-tip", "warning", `最小接続幅 ${fmt(w)} mm より細い先端・縁が ${big.length} 箇所あります（折れやすい）。`, big.slice(0, 40));
  }

  // 4. Too-small features (whole pieces / details thinner than the minimum feature width).
  const feat = erosionCheck(material, constraints.minFeatureWidth, false, morph);
  const tiny = feat.vanished.filter((r) => area(r.outer) >= 1e-3);
  if (tiny.length > 0) push("small-feature", "warning", `最小形状幅 ${fmt(constraints.minFeatureWidth)} mm より細い材料片が ${tiny.length} 個あります（切断時に失われる可能性）。`, tiny.map((r) => r.outer));

  // 5. Narrow empty gaps between material: the cut lines run too close to each other (kerf).
  //    Locating them needs a dilation of the (complex) complement; on big designs only the count is reported.
  const waste = flattenRegions(difference([sheetRegion(input.sheet)], flat));
  const wastePoints = waste.reduce((k, r) => k + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
  const gapCheck = erosionCheck(waste, constraints.minGap, wastePoints <= 6000, morph);
  if (gapCheck.necks.length > 0) push("narrow-gap", "warning", `材料同士の隙間が最小間隔 ${fmt(constraints.minGap)} mm より狭い箇所が ${gapCheck.necks.length} 箇所あります（カット線が近すぎます）。`, gapCheck.necks);
  else if (gapCheck.split) push("narrow-gap", "info", `材料同士の隙間が最小間隔 ${fmt(constraints.minGap)} mm より狭い箇所があります（${gapCheck.changes} 箇所。大きなデザインのため位置は特定していません）。`);
  const smallHoles = material.flatMap((r) => r.holes).filter((h) => contourExtent(h) < constraints.minHoleDiameter);
  if (smallHoles.length > 0) push("small-hole", "warning", `最小穴径 ${fmt(constraints.minHoleDiameter)} mm より小さい内部カットが ${smallHoles.length} 個あります。`, smallHoles);

  if (output.overflow) push("sheet-overflow", "warning", "形状がシートの外にはみ出しています。シート内で切り取られます。");

  let cutLength = 0;
  for (const r of flattenRegions(output.cutGeometry)) {
    cutLength += perimeter(r.outer);
    for (const h of r.holes) cutLength += perimeter(h);
  }
  const stats: ValidationStats = {
    regions: material.length,
    islands: stray.length,
    bridges: output.connectors.length,
    cutLength,
    apertureArea: regionArea(material),
  };
  return { ok: !issues.some((i) => i.severity === "error"), issues, stats };
}
