import { actionAddElement, actionAddRing } from "../editor/actions";
import { duplicateElement, duplicateRing, moveElement, moveRing, removeElement, removeRing, updateElement, updateRing } from "../editor/commands";
import { useEditor, type EditorStore } from "../editor/store";
import { ELEMENT_TYPES, type ElementType, type OrnamentRole, type SectorElement } from "../model/project";

const ROLE_BADGE: Record<OrnamentRole, string> = { primary: "P", secondary: "S", flow: "F", filler: "·", boundary: "B" };

export const ELEMENT_ICON: Record<ElementType, string> = {
  teardrop: "💧",
  leaf: "❧",
  petal: "❀",
  paisley: "☾",
  scurve: "∿",
  curl: "๑",
  spiral: "๑",
  arc: "◠",
  dot: "•",
  circle: "○",
  bezier: "✎",
  connector: "⊢",
  shape: "◇",
  compound: "⧉",
  ccurve: "⌒",
  hook: "↺",
  vine: "〰",
  doublecurl: "∾",
  opposedcurl: "ᔕ",
  tendril: "࿄",
};

function elementLabel(e: SectorElement): string {
  return e.name ?? ELEMENT_TYPES.find((t) => t.type === e.type)?.label ?? e.type;
}

export function RingTree({ store }: { store: EditorStore }) {
  const rings = useEditor((s) => s.project.rings);
  const center = useEditor((s) => s.project.center);
  const selection = useEditor((s) => s.selection);
  const hoverRing = useEditor((s) => s.hoverRingId);
  const hoverEl = useEditor((s) => s.hoverElementId);
  const name = useEditor((s) => s.project.name);
  const symmetry = useEditor((s) => s.project.symmetry);
  const selRing = selection.kind === "ring" || selection.kind === "element" ? selection.ringId : null;
  const selEl = selection.kind === "element" ? selection.elementId : null;
  const rowCls = (active: boolean, hovered: boolean): string => (active ? "bg-select-bg text-select" : hovered ? "bg-panel-2" : "hover:bg-panel-2");

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="panel-title">
        <span>Mandala Tree</span>
        <button type="button" className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] normal-case tracking-normal hover:border-select hover:text-select" onClick={() => actionAddRing(store)}>
          ＋ リング
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <button type="button" className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${rowCls(selection.kind === "project", false)}`} onClick={() => store.select({ kind: "project" })}>
          <span className="text-[14px]">✺</span>
          <span className="flex-1 truncate font-medium">{name}</span>
          <span className="text-[10px] text-ink-3">{symmetry}-fold</span>
        </button>
        <button type="button" className={`flex w-full items-center gap-2 py-1 pl-5 pr-3 text-left text-[12px] ${rowCls(selection.kind === "center", false)}`} onClick={() => store.select({ kind: "center" })}>
          <span className="text-ink-3">├</span>
          <span className="w-4 text-center">☀</span>
          <span className="flex-1 truncate">Center</span>
          <span className="text-[10px] text-ink-3">{center.type === "none" ? "なし" : `${center.type} × ${center.petals}`}</span>
        </button>
        {rings.length === 0 && <div className="px-4 py-4 text-center text-[11px] text-ink-3">リングがありません。「＋ リング」で追加してください。</div>}
        <ul>
          {rings.map((r, i) => {
            const isSel = r.id === selRing && selection.kind === "ring";
            const last = i === rings.length - 1;
            return (
              <li key={r.id}>
                <div className={`group flex items-center gap-1.5 py-1 pl-5 pr-2 text-[12px] ${rowCls(isSel, r.id === hoverRing && !hoverEl)} ${r.visible ? "" : "opacity-50"}`} onMouseEnter={() => store.hover(r.id)} onMouseLeave={() => store.hover(null)}>
                  <span className="text-ink-3">{last ? "└" : "├"}</span>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => store.select({ kind: "ring", ringId: r.id })}>
                    <span className="w-4 text-center text-[13px]">◎</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.name}</span>
                      <span className="block truncate text-[10px] text-ink-3">
                        sector × {r.repeat} · r {r.radius} mm{r.mirrorLocal ? " · mirror" : ""} · {r.elements.length} 要素
                      </span>
                    </span>
                  </button>
                  <span className="hidden items-center gap-0.5 group-hover:flex">
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" title="内側へ" disabled={i === 0} onClick={() => store.execute(moveRing(r.id, -1))}>
                      ↑
                    </button>
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" title="外側へ" disabled={last} onClick={() => store.execute(moveRing(r.id, 1))}>
                      ↓
                    </button>
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-ink" title="複製" onClick={() => store.execute(duplicateRing(r.id))}>
                      ⧉
                    </button>
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-error" title="削除" onClick={() => store.execute(removeRing(r.id))}>
                      ✕
                    </button>
                  </span>
                  <button type="button" className="w-5 text-center text-ink-3 hover:text-ink" title={r.visible ? "非表示にする" : "表示する"} onClick={() => store.execute(updateRing(r.id, { visible: !r.visible }, "表示切替"))}>
                    {r.visible ? "◉" : "○"}
                  </button>
                </div>
                <ul>
                  {r.elements.map((e, j) => {
                    const eSel = e.id === selEl;
                    const eLast = j === r.elements.length - 1;
                    return (
                      <li key={e.id}>
                        <div
                          className={`group flex items-center gap-1.5 py-0.5 pl-9 pr-2 text-[11px] ${rowCls(eSel, e.id === hoverEl)} ${e.visible ? "" : "opacity-50"}`}
                          onMouseEnter={() => store.hover(r.id, e.id)}
                          onMouseLeave={() => store.hover(null)}
                        >
                          <span className="text-ink-3">{last ? " " : "│"}</span>
                          <span className="text-ink-3">{eLast ? "└" : "├"}</span>
                          <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => store.select({ kind: "element", ringId: r.id, elementId: e.id })}>
                            <span className="w-4 text-center">{ELEMENT_ICON[e.type]}</span>
                            <span className="truncate">{elementLabel(e)}</span>
                            <span className="ml-auto shrink-0 text-[9px] text-ink-3">
                              {e.role ? `${ROLE_BADGE[e.role]} ` : ""}
                              {e.mode === "keep" ? "keep" : ""}
                              {e.repeat > 1 ? ` ×${e.repeat}` : ""}
                              {e.children && e.children.length > 0 ? ` ⊂${e.children.length}` : ""}
                            </span>
                          </button>
                          <span className="hidden items-center gap-0.5 group-hover:flex">
                            <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={j === 0} onClick={() => store.execute(moveElement(r.id, e.id, -1))} title="上へ">
                              ↑
                            </button>
                            <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" disabled={eLast} onClick={() => store.execute(moveElement(r.id, e.id, 1))} title="下へ">
                              ↓
                            </button>
                            <button type="button" className="rounded px-1 text-ink-3 hover:text-ink" onClick={() => store.execute(duplicateElement(r.id, e.id))} title="複製">
                              ⧉
                            </button>
                            <button type="button" className="rounded px-1 text-ink-3 hover:text-error" onClick={() => store.execute(removeElement(r.id, e.id))} title="削除">
                              ✕
                            </button>
                          </span>
                          <button type="button" className="w-5 text-center text-ink-3 hover:text-ink" onClick={() => store.execute(updateElement(r.id, e.id, { visible: !e.visible }, "表示切替"))}>
                            {e.visible ? "◉" : "○"}
                          </button>
                        </div>
                        {e.children && e.children.length > 0 && (
                          <ul>
                            {e.children.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  className={`flex w-full items-center gap-1.5 py-0.5 pl-16 pr-2 text-left text-[10px] ${c.id === selEl ? "bg-select-bg text-select" : "hover:bg-panel-2"}`}
                                  onClick={() => store.select({ kind: "element", ringId: r.id, elementId: c.id })}
                                >
                                  <span className="text-ink-3">↳</span>
                                  <span className="w-4 text-center">{ELEMENT_ICON[c.type]}</span>
                                  <span className="truncate">{elementLabel(c)}</span>
                                  <span className="ml-auto text-[9px] text-ink-3">{c.mode}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                  {(selRing === r.id || r.elements.length === 0) && (
                    <li className="py-0.5 pl-12 pr-2">
                      <AddElementMenu onPick={(t) => {
                        store.select({ kind: "ring", ringId: r.id });
                        actionAddElement(store, t);
                      }} />
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-ink-3">
        リング = 1セクタ（360°/repeat）のデザイン。要素はセクタ座標（x: 外向き, y: 接線方向）で配置し、mirror で左右対称にしてから回転複製されます。
      </div>
    </aside>
  );
}

export function AddElementMenu({ onPick }: { onPick: (t: ElementType) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ELEMENT_TYPES.filter((t) => t.type !== "compound").map((t) => (
        <button key={t.type} type="button" className="rounded border border-dashed border-line px-1.5 py-0.5 text-[10px] text-ink-3 hover:border-select hover:text-select" title={`${t.label}: ${t.description}`} onClick={() => onPick(t.type)}>
          {ELEMENT_ICON[t.type]} {t.label}
        </button>
      ))}
    </div>
  );
}
