/**
 * User-level actions shared by the toolbar, menus and keyboard shortcuts.
 */
import { exportJSON } from "../export/json";
import { encodeShareHash } from "../export/share";
import { exportSVG, projectFromSVG } from "../export/svg";
import { emptyProject, type Project } from "../model/project";
import { parseProject, normalizeProject } from "../model/validate";
import { loadPreset } from "../presets";
import { addElement, addRing, nextRing, removeElement, removeRing, replaceProject } from "./commands";
import { newElement, type ElementType } from "../model/project";
import { pickFile, safeFileName, saveFile } from "./persist";
import type { RenderData } from "./pipeline";
import { generateMandala } from "../geometry/radial/mandala";
import { buildStencil } from "../geometry/stencil/pipeline";
import type { EditorStore } from "./store";

export function actionNew(store: EditorStore): void {
  store.execute(replaceProject(emptyProject(), "新規プロジェクト"));
  store.notify("新規プロジェクトを作成しました。");
}

export function actionLoadPreset(store: EditorStore, id: string): void {
  const p = loadPreset(id);
  store.execute(replaceProject(p, `プリセット: ${p.name}`));
  store.notify(`プリセット「${p.name}」を読み込みました。`, "success");
}

export function actionAddRing(store: EditorStore): void {
  const ring = nextRing(store.getState().project);
  store.execute(addRing(ring));
  store.select({ kind: "ring", ringId: ring.id });
}

/** Add an element to the selected ring (or the last ring). */
export function actionAddElement(store: EditorStore, type: ElementType): void {
  const s = store.getState();
  let ringId = s.selection.kind === "ring" || s.selection.kind === "element" ? s.selection.ringId : s.project.rings[s.project.rings.length - 1]?.id;
  if (!ringId) {
    actionAddRing(store);
    ringId = store.getState().project.rings[store.getState().project.rings.length - 1]!.id;
  }
  const el = newElement(type, { name: type, y: type === "curl" || type === "scurve" || type === "paisley" ? 5 : 0 });
  store.execute(addElement(ringId, el));
  store.select({ kind: "element", ringId, elementId: el.id });
}

export function actionDeleteSelected(store: EditorStore): void {
  const sel = store.getState().selection;
  if (sel.kind === "element") store.execute(removeElement(sel.ringId, sel.elementId));
  else if (sel.kind === "ring") store.execute(removeRing(sel.ringId));
}

export function actionExportSVG(store: EditorStore, render: RenderData | null): void {
  const { project } = store.getState();
  const data = render;
  void data;
  const geometry = generateMandala(project);
  const stencil = buildStencil(project, geometry);
  if (stencil.islands.length > 0) {
    store.notify(`脱落する島が ${stencil.islands.length} 個残っています。ブリッジ設定を確認してください（書き出しは続行します）。`, "error");
  }
  const { svg, subpaths } = exportSVG(project, stencil.final);
  saveFile(`${safeFileName(project.name)}.svg`, svg, "image/svg+xml");
  store.notify(`SVGを書き出しました（${subpaths} パス）。`, "success");
}

export function actionSaveJSON(store: EditorStore): void {
  const { project } = store.getState();
  saveFile(`${safeFileName(project.name)}.mandala.json`, exportJSON(project), "application/json");
  store.notify("プロジェクトJSONを保存しました。", "success");
}

export async function actionOpen(store: EditorStore): Promise<void> {
  const file = await pickFile(".json,.svg,application/json,image/svg+xml");
  if (!file) return;
  try {
    const text = await file.text();
    let project: Project;
    if (/\.svg$/i.test(file.name) || text.trimStart().startsWith("<")) {
      const raw = projectFromSVG(text);
      if (!raw) throw new Error("このSVGにはMandalaFabのプロジェクト情報が含まれていません。");
      project = normalizeProject(raw);
    } else {
      project = parseProject(text);
    }
    store.execute(replaceProject(project, `開く: ${file.name}`));
    store.notify(`「${file.name}」を読み込みました。`, "success");
  } catch (e) {
    store.notify(e instanceof Error ? e.message : "読み込みに失敗しました。", "error");
  }
}

export async function actionShare(store: EditorStore): Promise<string> {
  const hash = await encodeShareHash(store.getState().project);
  const url = `${location.origin}${location.pathname}${hash}`;
  try {
    await navigator.clipboard.writeText(url);
    store.notify("共有URLをクリップボードにコピーしました。", "success");
  } catch {
    store.notify("共有URLを作成しました。", "success");
  }
  return url;
}
