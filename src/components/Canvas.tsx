import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasApi } from "../app/App";
import { useRender } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";
import { contourToPath } from "../editor/pipeline";
import { sheetContour } from "../geometry/stencil/sheet";
import { pointAngleDeg } from "../geometry/radial/transform";
import { publishCursor, publishZoom } from "./StatusBar";

interface View {
  /** Design-space point at the center of the viewport (mm). */
  cx: number;
  cy: number;
  /** Pixels per mm. */
  scale: number;
}

const RULER = 22;
const MIN_SCALE = 0.2;
const MAX_SCALE = 80;

/** Pick a "nice" mm step so ticks are at least `px` pixels apart. */
function niceStep(scale: number, px: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  for (const s of steps) if (s * scale >= px) return s;
  return 1000;
}

export function Canvas({ store, onApi, stale }: { store: EditorStore; onApi: (api: CanvasApi) => void; stale: boolean }) {
  const render = useRender();
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const selected = useEditor((s) => s.selectedRingId);
  const hover = useEditor((s) => s.hoverRingId);
  const focusedIssue = useEditor((s) => s.focusedIssueId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [v, setV] = useState<View>({ cx: 0, cy: 0, scale: 3 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  // Track viewport size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const w = size.w - RULER;
    const h = size.h - RULER;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(w / (project.sheet.width + 20), h / (project.sheet.height + 20))));
    setV({ cx: 0, cy: 0, scale });
  }, [size, project.sheet.width, project.sheet.height]);

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setV((old) => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old.scale * factor));
      if (px === undefined || py === undefined) return { ...old, scale };
      // Keep the design point under the cursor fixed.
      const vw = size.w - RULER;
      const vh = size.h - RULER;
      const dx = px - RULER - vw / 2;
      const dy = py - RULER - vh / 2;
      const wx = old.cx + dx / old.scale;
      const wy = old.cy + dy / old.scale;
      return { cx: wx - dx / scale, cy: wy - dy / scale, scale };
    });
  }, [size]);

  useEffect(() => onApi({ fit, zoomBy: (f) => zoomAt(f) }), [fit, zoomAt, onApi]);
  useEffect(() => publishZoom(v.scale / 3.7795), [v.scale]); // 100% = 1 mm on screen at 96 dpi

  // Fit once on first layout and when the sheet size changes.
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const key = `${project.sheet.width}x${project.sheet.height}`;
    if (size.w > 100 && fitted.current !== key) {
      fitted.current = key;
      fit();
    }
  }, [size, fit, project.sheet.width, project.sheet.height]);

  // Wheel: pan; ctrl/⌘ + wheel (incl. trackpad pinch): zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-Math.max(-300, Math.min(300, e.deltaY * unit)) * 0.005);
        zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setV((old) => ({ ...old, cx: old.cx + (e.deltaX * unit) / old.scale, cy: old.cy + (e.deltaY * unit) / old.scale }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const vw = Math.max(1, size.w - RULER);
  const vh = Math.max(1, size.h - RULER);
  const viewBox = `${v.cx - vw / 2 / v.scale} ${v.cy - vh / 2 / v.scale} ${vw / v.scale} ${vh / v.scale}`;
  const toDesign = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: v.cx + (clientX - rect.left - RULER - vw / 2) / v.scale, y: v.cy + (clientY - rect.top - RULER - vh / 2) / v.scale };
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: v.scale };
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (pinchStart.current.scale * d) / Math.max(1, pinchStart.current.dist)));
      setV((old) => ({ ...old, scale }));
      return;
    }
    const p = toDesign(e.clientX, e.clientY);
    publishCursor({ x: p.x, y: p.y, r: Math.hypot(p.x, p.y), angle: ((pointAngleDeg(p) % 360) + 360) % 360 });
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    setV((old) => ({ ...old, cx: d.cx - dx / old.scale, cy: d.cy - dy / old.scale }));
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && e.button === 0) {
      const target = e.target as Element;
      const ringId = target.getAttribute?.("data-ring");
      store.select(ringId ?? null);
    }
  };

  const sheetPath = useMemo(() => contourToPath(sheetContour(project.sheet)), [project.sheet]);
  const sheetW = project.sheet.width;
  const sheetH = project.sheet.height;
  const gridStep = niceStep(v.scale, 8);
  const majorStep = gridStep * 5;
  const rulerStep = niceStep(v.scale, 50);
  const left = v.cx - vw / 2 / v.scale;
  const top = v.cy - vh / 2 / v.scale;
  const right = v.cx + vw / 2 / v.scale;
  const bottom = v.cy + vh / 2 / v.scale;

  const rulerTicks = (from: number, to: number): number[] => {
    const out: number[] = [];
    const start = Math.floor(from / rulerStep) * rulerStep;
    for (let m = start; m <= to; m += rulerStep) out.push(Math.round(m * 1000) / 1000);
    return out;
  };

  const px = 1 / v.scale; // one screen pixel in design units
  const guideR = Math.max(sheetW, sheetH) * 0.75;
  const selectedRing = selected ? project.rings.find((r) => r.id === selected) : null;
  const errorIssues = render.issuePaths.filter((i) => i.severity === "error");
  const warnIssues = render.issuePaths.filter((i) => i.severity !== "error");

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 select-none overflow-hidden bg-bg" style={{ touchAction: "none" }}>
      {/* Rulers */}
      {view.rulers && (
        <>
          <svg className="absolute left-0 top-0" width={size.w} height={RULER} style={{ background: "#f2f4f7", borderBottom: "1px solid #d5dbe2" }}>
            {rulerTicks(left, right).map((m) => {
              const x = RULER + (m - left) * v.scale;
              return (
                <g key={m}>
                  <line x1={x} y1={RULER - 7} x2={x} y2={RULER} stroke="#8c98a2" strokeWidth={1} />
                  <text x={x + 3} y={11} fontSize={9} fill="#5b6b7a" fontFamily="monospace">
                    {m}
                  </text>
                </g>
              );
            })}
          </svg>
          <svg className="absolute left-0 top-0" width={RULER} height={size.h} style={{ background: "#f2f4f7", borderRight: "1px solid #d5dbe2" }}>
            {rulerTicks(top, bottom).map((m) => {
              const y = RULER + (m - top) * v.scale;
              return (
                <g key={m}>
                  <line x1={RULER - 7} y1={y} x2={RULER} y2={y} stroke="#8c98a2" strokeWidth={1} />
                  <text transform={`translate(10 ${y - 3}) rotate(-90)`} fontSize={9} fill="#5b6b7a" fontFamily="monospace">
                    {m}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="absolute left-0 top-0 flex items-center justify-center text-[9px] text-ink-3" style={{ width: RULER, height: RULER, background: "#f2f4f7" }}>
            mm
          </div>
        </>
      )}
      <svg
        className="absolute"
        style={{ left: view.rulers ? RULER : 0, top: view.rulers ? RULER : 0, cursor: drag.current?.moved ? "grabbing" : "default" }}
        width={vw}
        height={vh}
        viewBox={viewBox}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => publishCursor(null)}
      >
        <defs>
          <pattern id="grid-minor" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse" x={-sheetW / 2} y={-sheetH / 2}>
            <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="#d3dae2" strokeWidth={px} />
          </pattern>
          <pattern id="grid-major" width={majorStep} height={majorStep} patternUnits="userSpaceOnUse" x={-sheetW / 2} y={-sheetH / 2}>
            <rect width={majorStep} height={majorStep} fill="url(#grid-minor)" />
            <path d={`M ${majorStep} 0 L 0 0 0 ${majorStep}`} fill="none" stroke="#b9c3ce" strokeWidth={px} />
          </pattern>
          <filter id="sheet-shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx={0} dy={2 * px} stdDeviation={6 * px} floodColor="#1f2d3a" floodOpacity={0.18} />
          </filter>
        </defs>

        {/* Sheet */}
        <path d={sheetPath} fill="#ffffff" filter="url(#sheet-shadow)" />
        {view.grid && <path d={sheetPath} fill="url(#grid-major)" />}

        {/* Guides */}
        {view.guides && (
          <g pointerEvents="none">
            <line x1={-guideR} y1={0} x2={guideR} y2={0} stroke="#9fb3c8" strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
            <line x1={0} y1={-guideR} x2={0} y2={guideR} stroke="#9fb3c8" strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
            {Array.from({ length: project.symmetry }, (_, i) => {
              const a = ((360 / project.symmetry) * i - 90) * (Math.PI / 180);
              return <line key={i} x1={0} y1={0} x2={Math.cos(a) * guideR} y2={Math.sin(a) * guideR} stroke="#c9d5e0" strokeWidth={px} strokeDasharray={`${2 * px} ${4 * px}`} />;
            })}
            {selectedRing && (
              <>
                <circle r={selectedRing.radius} fill="none" stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${4 * px} ${4 * px}`} />
                {selectedRing.length > 0 && selectedRing.radius - selectedRing.length / 2 > 0 && <circle r={selectedRing.radius - selectedRing.length / 2} fill="none" stroke="#2f7bb5" strokeWidth={px} opacity={0.4} />}
                {selectedRing.length > 0 && <circle r={selectedRing.radius + selectedRing.length / 2} fill="none" stroke="#2f7bb5" strokeWidth={px} opacity={0.4} />}
              </>
            )}
          </g>
        )}

        {/* Geometry */}
        {view.mode === "design" ? (
          <g>
            {render.ringPaths.map((rp) => (
              <path
                key={rp.ringId}
                data-ring={rp.ringId}
                d={rp.d}
                fillRule="evenodd"
                className={`ring-path ${rp.ringId === selected ? "selected" : rp.ringId === hover ? "hover" : ""}`}
                onPointerEnter={() => store.hover(rp.ringId)}
                onPointerLeave={() => store.hover(null)}
              />
            ))}
            {render.islandPath && <path d={render.islandPath} fill="#f7c6c0" fillOpacity={0.6} stroke="#d84435" strokeWidth={px} pointerEvents="none" />}
          </g>
        ) : (
          <g>
            <path d={render.finalPath} fillRule="evenodd" fill="#e9edf1" stroke="#d84435" strokeWidth={Math.max(0.15, px)} />
            {/* Invisible ring hit targets so hover/select still work in stencil view. */}
            {render.ringPaths.map((rp) => (
              <path
                key={rp.ringId}
                data-ring={rp.ringId}
                d={rp.d}
                fillRule="evenodd"
                fill={rp.ringId === selected ? "#2f7bb5" : rp.ringId === hover ? "#5a86ad" : "transparent"}
                fillOpacity={0.25}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => store.hover(rp.ringId)}
                onPointerLeave={() => store.hover(null)}
              />
            ))}
          </g>
        )}

        {/* Bridges */}
        {view.showBridges && render.bridgePath && <path d={render.bridgePath} fill="#f6b26b" fillOpacity={0.75} stroke="#e08a2e" strokeWidth={px} pointerEvents="none" />}

        {/* Issues */}
        {view.showIssues && (
          <g pointerEvents="none">
            {warnIssues.map((i) => (
              <path key={i.id} d={i.d} fillRule="evenodd" fill="#f4c542" fillOpacity={i.id === focusedIssue ? 0.7 : 0.35} stroke="#d99a1e" strokeWidth={(i.id === focusedIssue ? 2 : 1) * px} />
            ))}
            {errorIssues.map((i) => (
              <path key={i.id} d={i.d} fillRule="evenodd" fill="#ff4d4d" fillOpacity={i.id === focusedIssue ? 0.7 : 0.4} stroke="#c62828" strokeWidth={(i.id === focusedIssue ? 2 : 1) * px} />
            ))}
          </g>
        )}

        {/* Center mark */}
        <g pointerEvents="none">
          <circle r={3 * px} fill="none" stroke="#c8793f" strokeWidth={px} />
          <line x1={-6 * px} y1={0} x2={6 * px} y2={0} stroke="#c8793f" strokeWidth={px} />
          <line x1={0} y1={-6 * px} x2={0} y2={6 * px} stroke="#c8793f" strokeWidth={px} />
        </g>
      </svg>

      {/* Overlay controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1">
        <button type="button" className="canvas-btn" onClick={() => zoomAt(1 / 1.25)} title="縮小">
          −
        </button>
        <button type="button" className="canvas-btn min-w-[52px] font-mono" onClick={fit} title="全体表示 (F)">
          {Math.round((v.scale / 3.7795) * 100)}%
        </button>
        <button type="button" className="canvas-btn" onClick={() => zoomAt(1.25)} title="拡大">
          +
        </button>
      </div>
      <div className="absolute left-8 top-8 rounded bg-paper/80 px-2 py-1 text-[11px] text-ink-2 shadow-sm">
        {view.mode === "design" ? "デザイン表示: リングごとの形状（赤 = 脱落する島）" : "ステンシル表示: 結合・ブリッジ後の切り抜き（赤線 = カットライン）"}
        {stale && <span className="ml-2 text-warn">計算中…</span>}
      </div>
      <div className="absolute bottom-3 left-8 text-[10px] text-ink-3">ドラッグ: パン · ホイール: スクロール · ⌘/Ctrl+ホイール: ズーム · クリック: リング選択</div>
    </div>
  );
}
