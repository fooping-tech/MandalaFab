import { actionAddRing } from "../editor/actions";
import { duplicateRing, moveRing, removeRing, updateRing } from "../editor/commands";
import { useEditor, type EditorStore } from "../editor/store";
import { getMotif } from "../geometry/motifs";

const MOTIF_ICON: Record<string, string> = {
  circle: "○",
  dot: "•",
  petal: "❀",
  leaf: "❧",
  diamond: "◇",
  triangle: "△",
  arc: "◠",
  teardrop: "💧",
  line: "│",
  wave: "〰",
  spiral: "๑",
};

export function RingTree({ store }: { store: EditorStore }) {
  const rings = useEditor((s) => s.project.rings);
  const selected = useEditor((s) => s.selectedRingId);
  const hover = useEditor((s) => s.hoverRingId);
  const name = useEditor((s) => s.project.name);
  const symmetry = useEditor((s) => s.project.symmetry);
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="panel-title">
        <span>Rings</span>
        <button type="button" className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] normal-case tracking-normal hover:border-select hover:text-select" onClick={() => actionAddRing(store)}>
          ＋ リング
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <button
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${selected === null ? "bg-select-bg text-select" : "hover:bg-panel-2"}`}
          onClick={() => store.select(null)}
        >
          <span className="text-[14px]">✺</span>
          <span className="flex-1 truncate font-medium">{name}</span>
          <span className="text-[10px] text-ink-3">{symmetry}-fold</span>
        </button>
        {rings.length === 0 && <div className="px-4 py-6 text-center text-[11px] text-ink-3">リングがありません。「＋ リング」で追加してください。</div>}
        <ul>
          {rings.map((r, i) => {
            const isSel = r.id === selected;
            const isHover = r.id === hover;
            const def = getMotif(r.motif);
            return (
              <li key={r.id}>
                <div
                  className={`group flex items-center gap-1.5 py-1 pl-5 pr-2 text-[12px] ${isSel ? "bg-select-bg text-select" : isHover ? "bg-panel-2" : "hover:bg-panel-2"} ${r.visible ? "" : "opacity-50"}`}
                  onMouseEnter={() => store.hover(r.id)}
                  onMouseLeave={() => store.hover(null)}
                >
                  <span className="text-ink-3">{i === rings.length - 1 ? "└" : "├"}</span>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => store.select(r.id)}>
                    <span className="w-4 text-center text-[13px]">{MOTIF_ICON[r.motif] ?? "◌"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.name}</span>
                      <span className="block truncate text-[10px] text-ink-3">
                        {def.label} × {r.count} · r {r.radius} mm{r.strokeWidth > 0 ? ` · 線 ${r.strokeWidth}` : ""}
                      </span>
                    </span>
                  </button>
                  <span className="hidden items-center gap-0.5 group-hover:flex">
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" title="内側へ" disabled={i === 0} onClick={() => store.execute(moveRing(r.id, -1))}>
                      ↑
                    </button>
                    <button type="button" className="rounded px-1 text-ink-3 hover:text-ink disabled:opacity-30" title="外側へ" disabled={i === rings.length - 1} onClick={() => store.execute(moveRing(r.id, 1))}>
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
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-ink-3">
        リングは内側から外側の順に並びます。クリックで選択し、右のインスペクタで編集します。
      </div>
    </aside>
  );
}
