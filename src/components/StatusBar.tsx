import { useEffect, useState } from "react";
import { useRender } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";

export interface CursorInfo {
  x: number;
  y: number;
  r: number;
  angle: number;
}

let cursorListeners = new Set<(c: CursorInfo | null) => void>();
export function publishCursor(c: CursorInfo | null): void {
  for (const l of cursorListeners) l(c);
}
let zoomListeners = new Set<(z: number) => void>();
export function publishZoom(z: number): void {
  for (const l of zoomListeners) l(z);
}

export function StatusBar({ store, stale }: { store: EditorStore; stale: boolean }) {
  const message = useEditor((s) => s.message);
  const render = useRender();
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [zoom, setZoom] = useState(1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    cursorListeners.add(setCursor);
    zoomListeners.add(setZoom);
    return () => {
      cursorListeners.delete(setCursor);
      zoomListeners.delete(setZoom);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 7000);
    return () => window.clearTimeout(t);
  }, [message]);

  const stats = render.validation.stats;
  const errors = render.validation.issues.filter((i) => i.severity === "error").length;
  const warnings = render.validation.issues.filter((i) => i.severity === "warning").length;
  const kindClass = message?.kind === "error" ? "text-error" : message?.kind === "success" ? "text-ok" : "text-ink-2";

  return (
    <footer className="flex h-[30px] shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-ink-2">
      <div className={`min-w-0 flex-1 truncate ${kindClass}`} role="status" aria-live="polite">
        {visible && message ? message.text : "ブラウザ内で編集 · 単位 mm · 中心が原点"}
      </div>
      <div className="font-mono tabular-nums">
        {cursor ? `X ${cursor.x.toFixed(2)}  Y ${cursor.y.toFixed(2)}  r ${cursor.r.toFixed(2)}  θ ${cursor.angle.toFixed(1)}°` : "X —  Y —"}
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span title="結合後の切り抜き領域数">領域 {stats.regions}</span>
        <span title="ブリッジ数">ブリッジ {stats.bridges}</span>
        <span title="カット線の総延長">カット {stats.cutLength >= 1000 ? `${(stats.cutLength / 1000).toFixed(2)} m` : `${stats.cutLength.toFixed(0)} mm`}</span>
        <span className={errors > 0 ? "text-error" : warnings > 0 ? "text-warn" : "text-ok"} title="検証結果">
          {errors > 0 ? `✕ ${errors} エラー` : warnings > 0 ? `△ ${warnings} 警告` : "✓ 問題なし"}
        </span>
        <span className={stale ? "text-warn" : "text-ink-3"} title="ジオメトリ計算時間">
          {stale ? "計算中…" : `${render.computeMs.toFixed(0)} ms`}
        </span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <button type="button" className="text-ink-3 hover:text-ink" onClick={() => store.notify("MandalaFab: 曼荼羅ステンシルCAD。検証結果は材料強度や完全性を保証するものではありません。")}>
        ⓘ
      </button>
    </footer>
  );
}
