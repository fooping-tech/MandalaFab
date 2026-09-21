/**
 * User-level actions shared by the toolbar, menus and keyboard shortcuts.
 */
import { exportJSON } from "../export/json";
import { encodeShareHash } from "../export/share";
import { exportSVG, projectFromSVG } from "../export/svg";
import { emptyProject, type Project } from "../model/project";
import { parseProject, normalizeProject } from "../model/validate";
import { loadPreset } from "../presets";
import { addElement, addRing, duplicateElement, duplicateElements, duplicateRing, findElementDeep, insertPartElement, insertPartRing, makeCompound, nextRing, removeElement, removeElements, removeRing, replaceProject, ungroupCompound } from "./commands";
import { selectedItems } from "./store";
import { freshIds, parseLibrary, partFromElement, partFromProject, partFromRing, serializeLibrary, type LibraryItem } from "../model/library";
import { addLibraryItems, getLibrary } from "./library-store";
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

// ---- user parts library ------------------------------------------------------

/** Save the current selection (element / ring / whole project) to the parts library. */
export function actionSavePart(store: EditorStore, name?: string): LibraryItem | null {
  const { project, selection } = store.getState();
  let item: LibraryItem | null = null;
  if (selection.kind === "element") {
    const ring = project.rings.find((r) => r.id === selection.ringId);
    const el = ring ? findElementDeep(ring.elements, selection.elementId) : undefined;
    if (!el) return null;
    const n = name ?? window.prompt("パーツ名", el.name ?? el.type);
    if (n === null) return null;
    item = partFromElement(el, project.compounds, n);
  } else if (selection.kind === "ring") {
    const ring = project.rings.find((r) => r.id === selection.ringId);
    if (!ring) return null;
    const n = name ?? window.prompt("パーツ名（リング）", ring.name);
    if (n === null) return null;
    item = partFromRing(ring, project.compounds, n);
  } else {
    const n = name ?? window.prompt("パーツ名（プロジェクト全体）", project.name);
    if (n === null) return null;
    item = partFromProject(project, n);
  }
  const ok = addLibraryItems([item]);
  if (ok) store.notify(`「${item.name}」をマイパーツに保存しました。`, "success");
  else store.notify(`「${item.name}」を追加しましたが、ブラウザに保存できませんでした（容量不足やプライベートモード）。書き出しで JSON に保存してください。`, "error");
  return item;
}

/** Insert a library part: element → selected/last ring, ring → new ring, project → replace. */
export function actionInsertPart(store: EditorStore, item: LibraryItem): void {
  const part = freshIds(item);
  if (part.kind === "project") {
    store.execute(replaceProject(part.data, `パーツ: ${part.name}`));
    store.notify(`「${part.name}」を開きました。`, "success");
    return;
  }
  if (part.kind === "ring") {
    store.execute(insertPartRing(part.data, part.compounds));
    store.select({ kind: "ring", ringId: part.data.id });
    store.notify(`リング「${part.name}」を追加しました。`, "success");
    return;
  }
  const s = store.getState();
  let ringId = s.selection.kind === "ring" || s.selection.kind === "element" ? s.selection.ringId : s.project.rings[s.project.rings.length - 1]?.id;
  if (!ringId) {
    const ring = { ...nextRing(s.project), elements: [] };
    store.execute(addRing(ring));
    ringId = ring.id;
  }
  store.execute(insertPartElement(ringId, part.data, part.compounds));
  store.select({ kind: "element", ringId, elementId: part.data.id });
  store.notify(`「${part.name}」を挿入しました。`, "success");
}

export async function actionImportParts(store: EditorStore): Promise<void> {
  const file = await pickFile(".json,application/json");
  if (!file) return;
  try {
    const items = parseLibrary(await file.text());
    if (items.length === 0) {
      store.notify("読み込めるパーツがありませんでした。", "error");
      return;
    }
    const ok = addLibraryItems(items);
    store.notify(ok ? `パーツ ${items.length} 件を読み込みました。` : `パーツ ${items.length} 件を読み込みましたが、ブラウザに保存できませんでした。`, ok ? "success" : "error");
  } catch (e) {
    store.notify(e instanceof Error ? e.message : "パーツを読み込めませんでした。", "error");
  }
}

export function actionExportParts(store: EditorStore, items: readonly LibraryItem[] = getLibrary()): void {
  if (items.length === 0) {
    store.notify("書き出すパーツがありません。", "error");
    return;
  }
  saveFile("mandalafab.parts.json", serializeLibrary(items), "application/json");
  store.notify(`パーツ ${items.length} 件を書き出しました。`, "success");
}

export function actionDeleteSelected(store: EditorStore): void {
  const sel = store.getState().selection;
  if (sel.kind === "element") store.execute(removeElement(sel.ringId, sel.elementId));
  else if (sel.kind === "multi") store.execute(removeElements(sel.items));
  else if (sel.kind === "ring") store.execute(removeRing(sel.ringId));
}

export function actionDuplicateSelected(store: EditorStore): void {
  const sel = store.getState().selection;
  if (sel.kind === "element") store.execute(duplicateElement(sel.ringId, sel.elementId));
  else if (sel.kind === "multi") store.execute(duplicateElements(sel.items));
  else if (sel.kind === "ring") store.execute(duplicateRing(sel.ringId));
}

/** Select every top-level element of every visible ring. */
export function actionSelectAll(store: EditorStore): void {
  const { project } = store.getState();
  store.selectMany(project.rings.filter((r) => r.visible).flatMap((r) => r.elements.map((e) => ({ ringId: r.id, elementId: e.id }))));
}

/**
 * Group the selected elements into one compound motif (グループ化). All must be
 * top-level elements of the same ring. Returns the new compound element id.
 */
export function actionGroupSelected(store: EditorStore, name = "Group"): string | null {
  const { project, selection } = store.getState();
  const items = selectedItems(selection);
  if (items.length < 2) {
    store.notify("グループ化するには要素を 2 つ以上選択してください（Shift+クリックや範囲選択）。", "error");
    return null;
  }
  const ringIds = new Set(items.map((i) => i.ringId));
  if (ringIds.size > 1) {
    store.notify("グループ化できるのは同じリング内の要素だけです。", "error");
    return null;
  }
  const ring = project.rings.find((r) => r.id === items[0]!.ringId);
  if (!ring) return null;
  const ids = items.map((i) => i.elementId).filter((id) => ring.elements.some((e) => e.id === id));
  if (ids.length < 2) {
    store.notify("入れ子の要素はグループ化できません。リング直下の要素を選んでください。", "error");
    return null;
  }
  const before = new Set(ring.elements.map((e) => e.id));
  store.execute(makeCompound(ring.id, ids, name));
  const after = store.getState().project.rings.find((r) => r.id === ring.id);
  const created = after?.elements.find((e) => e.type === "compound" && !before.has(e.id));
  if (created) store.select({ kind: "element", ringId: ring.id, elementId: created.id });
  store.notify(`${ids.length} 要素をグループ「${name}」にまとめました（複合モチーフ）。`, "success");
  return created?.id ?? null;
}

/** Split the selected compound element back into its members. */
export function actionUngroupSelected(store: EditorStore): boolean {
  const { project, selection } = store.getState();
  if (selection.kind !== "element") return false;
  const ring = project.rings.find((r) => r.id === selection.ringId);
  const el = ring?.elements.find((e) => e.id === selection.elementId);
  if (!ring || !el || el.type !== "compound") {
    store.notify("グループ解除できるのはリング直下の複合モチーフです。", "error");
    return false;
  }
  const before = new Set(ring.elements.map((e) => e.id));
  store.execute(ungroupCompound(ring.id, el.id));
  const after = store.getState().project.rings.find((r) => r.id === ring.id);
  const members = after?.elements.filter((e) => !before.has(e.id)) ?? [];
  store.selectMany(members.map((e) => ({ ringId: ring.id, elementId: e.id })));
  store.notify(`グループを解除しました（${members.length} 要素）。`, "success");
  return true;
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
