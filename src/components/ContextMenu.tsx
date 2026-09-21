import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { actionAddRing, actionDeleteSelected, actionDuplicateSelected, actionGroupSelected, actionSavePart, actionSelectAll, actionSetLockedSelected, actionSetVisibleSelected, actionUngroupSelected } from "../editor/actions";
import { updateElement, updateElements, updateRing } from "../editor/commands";
import { selectedItems, useEditor, type EditorStore } from "../editor/store";

export interface MenuAnchor {
  x: number;
  y: number;
}

type Item = { kind: "item"; label: string; shortcut?: string; danger?: boolean; disabled?: boolean; run: () => void } | { kind: "sep" };
const sep: Item = { kind: "sep" };

/**
 * Right-click menu of the canvas. Items depend on what is selected (the canvas
 * selects the right-clicked element first). Closes on click outside, Escape, or scroll.
 */
export function ContextMenu({ store, at, onClose, fit }: { store: EditorStore; at: MenuAnchor | null; onClose: () => void; fit: () => void }) {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuAnchor | null>(at);

  useLayoutEffect(() => {
    if (!at) {
      setPos(null);
      return;
    }
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 300;
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - w - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - h - 4)) });
  }, [at]);

  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [at, onClose]);

  if (!at) return null;

  const items: Item[] = [];
  const wrap = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const sel = selection;
  const picked = selectedItems(sel);
  if (sel.kind === "element" || sel.kind === "multi") {
    const ring = project.rings.find((r) => r.id === picked[0]!.ringId);
    const single = sel.kind === "element" && ring ? ring.elements.find((e) => e.id === sel.elementId) ?? ring.elements.flatMap((e) => e.children ?? []).find((e) => e.id === sel.elementId) : undefined;
    const topLevelSingle = sel.kind === "element" && !!ring?.elements.some((e) => e.id === sel.elementId);
    const sameRing = new Set(picked.map((i) => i.ringId)).size === 1;
    const topLevelCount = ring ? picked.filter((i) => ring.elements.some((e) => e.id === i.elementId)).length : 0;
    items.push({ kind: "item", label: sel.kind === "multi" ? `${picked.length} 要素を複製` : "複製", shortcut: "⌘D", run: wrap(() => actionDuplicateSelected(store)) });
    items.push({ kind: "item", label: "グループ化（複合モチーフ）", shortcut: "⌘G", disabled: !(sameRing && topLevelCount >= 2), run: wrap(() => actionGroupSelected(store)) });
    if (single?.type === "compound" && topLevelSingle) items.push({ kind: "item", label: "グループ解除", shortcut: "⌘⇧G", run: wrap(() => actionUngroupSelected(store)) });
    items.push({ kind: "item", label: sel.kind === "multi" ? `${picked.length} 要素をマイパーツに登録…` : "マイパーツに登録…", disabled: sel.kind === "multi" && !(sameRing && topLevelCount >= 1), run: wrap(() => actionSavePart(store)) });
    if (sel.kind === "element") {
      if (single && ring) {
        items.push(sep);
        items.push({ kind: "item", label: single.mode === "keep" ? "cut（抜く）に切替" : "keep（残す）に切替", run: wrap(() => store.execute(updateElement(ring.id, single.id, { mode: single.mode === "keep" ? "cut" : "keep" }, "cut/keep 切替"))) });
        items.push({ kind: "item", label: single.mirror ? "反転を戻す" : "左右反転", run: wrap(() => store.execute(updateElement(ring.id, single.id, { mirror: !single.mirror }, "反転"))) });
        items.push({ kind: "item", label: single.visible ? "非表示にする" : "表示する", run: wrap(() => actionSetVisibleSelected(store, !single.visible)) });
        items.push({ kind: "item", label: single.locked ? "ロック解除" : "ロック（選択・移動を禁止）", run: wrap(() => actionSetLockedSelected(store, !single.locked)) });
      }
    } else {
      items.push(sep);
      items.push({ kind: "item", label: `${picked.length} 要素を非表示にする`, run: wrap(() => actionSetVisibleSelected(store, false)) });
      items.push({ kind: "item", label: `${picked.length} 要素をロック`, run: wrap(() => actionSetLockedSelected(store, true)) });
      items.push({ kind: "item", label: `${picked.length} 要素のロックを解除`, run: wrap(() => actionSetLockedSelected(store, false)) });
    }
    items.push(sep);
    if (ring) items.push({ kind: "item", label: `リング「${ring.name}」を選択`, run: wrap(() => store.select({ kind: "ring", ringId: ring.id })) });
    if (ring) items.push({ kind: "item", label: "このリングの要素をすべて選択", run: wrap(() => store.selectMany(ring.elements.map((e) => ({ ringId: ring.id, elementId: e.id })))) });
    items.push({ kind: "item", label: sel.kind === "multi" ? `${picked.length} 要素を削除` : "削除", shortcut: "Delete", danger: true, run: wrap(() => actionDeleteSelected(store)) });
  } else if (sel.kind === "ring") {
    const ring = project.rings.find((r) => r.id === sel.ringId);
    items.push({ kind: "item", label: "リングを複製", shortcut: "⌘D", run: wrap(() => actionDuplicateSelected(store)) });
    items.push({ kind: "item", label: "リングをマイパーツに登録…", run: wrap(() => actionSavePart(store)) });
    if (ring) {
      items.push({ kind: "item", label: "要素をすべて選択", run: wrap(() => store.selectMany(ring.elements.map((e) => ({ ringId: ring.id, elementId: e.id })))) });
      items.push(sep);
      items.push({ kind: "item", label: ring.mirrorLocal ? "セクタ内ミラーを解除" : "セクタ内ミラーにする", run: wrap(() => store.execute(updateRing(ring.id, { mirrorLocal: !ring.mirrorLocal }))) });
      items.push({ kind: "item", label: ring.visible ? "非表示にする" : "表示する", run: wrap(() => store.execute(updateRing(ring.id, { visible: !ring.visible }, "表示切替"))) });
      items.push({ kind: "item", label: ring.locked ? "リングのロックを解除" : "リングをロック（要素ごと選択・移動を禁止）", run: wrap(() => actionSetLockedSelected(store, !ring.locked)) });
    }
    items.push(sep);
    items.push({ kind: "item", label: "リングを削除", shortcut: "Delete", danger: true, run: wrap(() => actionDeleteSelected(store)) });
  } else {
    items.push({ kind: "item", label: "リングを追加", shortcut: "N", run: wrap(() => actionAddRing(store)) });
    items.push({ kind: "item", label: "すべての要素を選択", shortcut: "⌘A", run: wrap(() => actionSelectAll(store)) });
    if (project.rings.some((r) => r.locked || r.elements.some((e) => e.locked))) items.push({ kind: "item", label: "すべてのロックを解除", run: wrap(() => { for (const r of project.rings) { if (r.locked) store.execute(updateRing(r.id, { locked: false }, "ロック解除")); const ids = r.elements.filter((e) => e.locked).map((e) => ({ ringId: r.id, elementId: e.id })); if (ids.length > 0) store.execute(updateElements(ids, { locked: false }, "ロック解除")); } }) });
    items.push({ kind: "item", label: "プロジェクトをマイパーツに登録…", run: wrap(() => actionSavePart(store)) });
    items.push(sep);
    items.push({ kind: "item", label: "全体表示", shortcut: "F", run: wrap(fit) });
    items.push({ kind: "item", label: "元に戻す", shortcut: "⌘Z", disabled: !store.getState().canUndo, run: wrap(() => store.undo()) });
  }
  if (sel.kind !== "project") {
    items.push(sep);
    items.push({ kind: "item", label: "選択解除", shortcut: "Esc", run: wrap(() => store.select({ kind: "project" })) });
  }

  return (
    <div ref={ref} role="menu" data-testid="context-menu" className="fixed z-50 min-w-[220px] rounded-md border border-line bg-paper py-1 text-[12px] shadow-lg" style={{ left: (pos ?? at).x, top: (pos ?? at).y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.kind === "sep" ? (
          <div key={i} className="my-1 border-t border-line-2" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={`flex w-full items-center gap-3 px-3 py-1 text-left ${it.disabled ? "text-ink-3 opacity-60" : it.danger ? "text-error hover:bg-panel-2" : "hover:bg-select-bg hover:text-select"}`}
            onClick={it.run}
          >
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="font-mono text-[10px] text-ink-3">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
