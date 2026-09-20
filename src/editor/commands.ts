/**
 * Commands are pure functions Project -> Project. The store records the
 * previous project for undo, so a command only needs to describe "apply".
 * `coalesceKey` merges rapid consecutive edits (slider drags) into one undo step.
 */
import { defaultRing, newId, type BridgeSettings, type Constraints, type Project, type Ring, type Sheet } from "../model/project";

export interface Command {
  label: string;
  coalesceKey?: string;
  apply(project: Project): Project;
}

export const updateRing = (id: string, patch: Partial<Ring>, label = "リングを編集"): Command => ({
  label,
  coalesceKey: `ring:${id}:${Object.keys(patch).join(",")}`,
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const rings = p.rings.slice();
    rings[i] = { ...rings[i]!, ...patch };
    return { ...p, rings };
  },
});

export const updateRingParam = (id: string, key: string, value: number): Command => ({
  label: "モチーフのパラメータを編集",
  coalesceKey: `ring:${id}:param:${key}`,
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const rings = p.rings.slice();
    rings[i] = { ...rings[i]!, params: { ...rings[i]!.params, [key]: value } };
    return { ...p, rings };
  },
});

export const addRing = (ring: Ring, index?: number): Command => ({
  label: "リングを追加",
  apply: (p) => {
    const rings = p.rings.slice();
    rings.splice(index ?? rings.length, 0, ring);
    return { ...p, rings };
  },
});

/** A sensible new ring placed just outside the current outermost ring. */
export function nextRing(project: Project): Ring {
  const outer = project.rings.reduce((m, r) => Math.max(m, r.radius + r.length / 2), 0);
  const limit = Math.min(project.sheet.width, project.sheet.height) / 2 - 5;
  const radius = Math.min(limit - 8, outer + 12);
  const count = project.symmetry;
  const circumference = 2 * Math.PI * Math.max(radius, 1);
  const width = Math.max(2, Math.min(12, (circumference / count) * 0.5));
  return defaultRing({
    name: `Ring ${project.rings.length + 1}`,
    motif: "petal",
    count,
    radius: Math.max(0, Math.round(radius)),
    length: 16,
    width: Math.round(width * 2) / 2,
  });
}

export const removeRing = (id: string): Command => ({
  label: "リングを削除",
  apply: (p) => ({ ...p, rings: p.rings.filter((r) => r.id !== id) }),
});

export const duplicateRing = (id: string): Command => ({
  label: "リングを複製",
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    if (i < 0) return p;
    const src = p.rings[i]!;
    const copy: Ring = { ...src, id: newId(), name: `${src.name} copy`, params: { ...src.params } };
    const rings = p.rings.slice();
    rings.splice(i + 1, 0, copy);
    return { ...p, rings };
  },
});

export const moveRing = (id: string, delta: -1 | 1): Command => ({
  label: "リングの順序を変更",
  apply: (p) => {
    const i = p.rings.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= p.rings.length) return p;
    const rings = p.rings.slice();
    [rings[i], rings[j]] = [rings[j]!, rings[i]!];
    return { ...p, rings };
  },
});

export const replaceProject = (project: Project, label = "プロジェクトを読み込み"): Command => ({ label, apply: () => project });

export const updateProject = (patch: Partial<Pick<Project, "name" | "symmetry" | "seed" | "generator">>, label = "プロジェクト設定"): Command => ({
  label,
  coalesceKey: `project:${Object.keys(patch).join(",")}`,
  apply: (p) => ({ ...p, ...patch }),
});

export const updateSheet = (patch: Partial<Sheet>): Command => ({
  label: "シート設定",
  coalesceKey: `sheet:${Object.keys(patch).join(",")}`,
  apply: (p) => ({ ...p, sheet: { ...p.sheet, ...patch } }),
});

export const updateConstraints = (patch: Partial<Constraints>): Command => ({
  label: "加工制約",
  coalesceKey: `constraints:${Object.keys(patch).join(",")}`,
  apply: (p) => ({ ...p, constraints: { ...p.constraints, ...patch } }),
});

export const updateBridges = (patch: Partial<BridgeSettings>): Command => ({
  label: "ブリッジ設定",
  coalesceKey: `bridges:${Object.keys(patch).join(",")}`,
  apply: (p) => ({ ...p, bridges: { ...p.bridges, ...patch } }),
});

/** Multiply every ring count that equals the old symmetry (or a multiple) when symmetry changes. */
export const setSymmetry = (symmetry: number, rescaleCounts: boolean): Command => ({
  label: "対称数を変更",
  apply: (p) => {
    if (!rescaleCounts || p.symmetry === symmetry) return { ...p, symmetry };
    const rings = p.rings.map((r) => {
      if (r.count <= 1 || r.count % p.symmetry !== 0) return r;
      const k = r.count / p.symmetry;
      return { ...r, count: Math.max(1, Math.round(k * symmetry)) };
    });
    return { ...p, symmetry, rings };
  },
});
