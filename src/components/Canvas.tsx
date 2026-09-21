import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasApi } from "../app/App";
import { addElement, addRing, nextRing, setBezierPoint, updateElement, updateRing } from "../editor/commands";
import { cubicsToPoints, fitClosedPolygon, fitCurve } from "../import/bezier-fit";
import { conditionStroke, polylineLength } from "../geometry/stroke";
import { newElement } from "../model/project";
import { contourToPath } from "../editor/pipeline";
import { useRenderState } from "../editor/render-context";
import { isLocked, selectedItems, useEditor, type EditorStore } from "../editor/store";
import { ContextMenu, type MenuAnchor } from "./ContextMenu";
import { applyElementTransform, elementTransform, invertElementTransform } from "../geometry/elements/sector";
import { instanceTransform } from "../geometry/radial/repeat";
import { applyTransform, invertTransform, pointAngleDeg } from "../geometry/radial/transform";
import { sheetContour } from "../geometry/stencil/sheet";
import { CENTER_ID } from "../geometry/radial/mandala";
import { publishCursor, publishZoom } from "./StatusBar";
import { useCoarsePointer } from "../app/use-media";

interface View {
  cx: number;
  cy: number;
  scale: number; // px per mm
}

const RULER = 22;
const MIN_SCALE = 0.2;
const MAX_SCALE = 80;
const PX_PER_MM_100 = 3.7795;

function niceStep(scale: number, px: number): number {
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  for (const s of steps) if (s * scale >= px) return s;
  return 1000;
}

type HandleKind = "origin" | "rotate" | "length" | "width" | "ring-radius" | number;
type DragState =
  | { kind: "pan"; x: number; y: number; cx: number; cy: number; moved: boolean; hitRing: string | null; hitElement: string | null }
  | { kind: "handle"; ringId: string; elementId: string | null; handle: HandleKind; moved: boolean }
  | { kind: "marquee"; sx: number; sy: number; x0: number; y0: number; x1: number; y1: number; shift: boolean; moved: boolean; hitRing: string | null; hitElement: string | null }
  | { kind: "draw"; points: { x: number; y: number }[] };

const WHEEL_KEY = "mandalafab-wheel-zoom";
function loadWheelZoom(): boolean {
  try {
    return localStorage.getItem(WHEEL_KEY) !== "scroll";
  } catch {
    return true;
  }
}

/** One element's outline. Memoised so hovering / selecting one element does not repaint the others. */
const ElementPath = memo(function ElementPath({ ringId, elementId, d, fill, fillOpacity, stroke, strokeWidth, onEnter, onLeave }: { ringId: string; elementId: string; d: string; fill: string; fillOpacity: number; stroke: string; strokeWidth: number; onEnter: (r: string, e: string) => void; onLeave: () => void }) {
  return <path data-ring={ringId} data-element={elementId} d={d} fillRule="evenodd" fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} style={{ cursor: "pointer" }} onPointerEnter={() => onEnter(ringId, elementId)} onPointerLeave={onLeave} />;
});

export function Canvas({ store, onApi }: { store: EditorStore; onApi: (api: CanvasApi) => void }) {
  const render = useRenderState();
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const hoverEl = useEditor((s) => s.hoverElementId);
  const hoverRing = useEditor((s) => s.hoverRingId);
  const focusedIssue = useEditor((s) => s.focusedIssueId);
  const reference = useEditor((s) => s.reference);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 0 until measured, so the first fit uses the real viewport (phones are much narrower than the default).
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [v, setV] = useState<View>({ cx: 0, cy: 0, scale: 3 });
  const drag = useRef<DragState | null>(null);
  const [wheelZoom, setWheelZoom] = useState(loadWheelZoom);
  const wheelZoomRef = useRef(wheelZoom);
  wheelZoomRef.current = wheelZoom;
  const onEnter = useCallback((r: string, e: string) => store.hover(r, e), [store]);
  const onLeave = useCallback(() => store.hover(null), [store]);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; cx: number; cy: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const spaceDown = useRef(false);
  const coarse = useCoarsePointer();
  /** Touch: one-finger drag selects a rectangle instead of panning. */
  const [boxSelect, setBoxSelect] = useState(false);
  const longPress = useRef<{ timer: number; x: number; y: number; pointerId: number } | null>(null);
  /** Pen / finger drawing: strokes become Bézier elements of the selected ring. */
  const [drawMode, setDrawMode] = useState(false);
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null);
  const cancelLongPress = (): void => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  const selectedIds = useMemo(() => new Set(selectedItems(selection).map((i) => i.elementId)), [selection]);
  /** Element ids that cannot be picked on the canvas (own lock or ring lock). */
  const lockedIds = useMemo(() => {
    const out = new Set<string>();
    const walk = (list: readonly (typeof project.rings)[number]["elements"][number][], ringLocked: boolean): void => {
      for (const e of list) {
        if (ringLocked || e.locked) out.add(e.id);
        if (e.children) walk(e.children, ringLocked || !!e.locked);
      }
    };
    for (const r of project.rings) walk(r.elements, !!r.locked);
    return out;
  }, [project.rings]);
  const lockedRingIds = useMemo(() => new Set(project.rings.filter((r) => r.locked).map((r) => r.id)), [project.rings]);

  // Touch: keep the browser from scrolling / zooming the page while gesturing on the canvas
  // (touch-action: none is not honoured everywhere, notably older iOS Safari for pinch).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent): void => e.preventDefault();
    const onGesture = (e: Event): void => e.preventDefault();
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("gesturestart", onGesture);
    el.addEventListener("gesturechange", onGesture);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("gesturestart", onGesture);
      el.removeEventListener("gesturechange", onGesture);
    };
  }, []);

  // Space held = pan with the left button (like most vector editors).
  useEffect(() => {
    const typing = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent): void => {
      if (e.key === " " && !typing(e.target)) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent): void => {
      if (e.key === " ") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => (spaceDown.current = false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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

  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      setV((old) => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, old.scale * factor));
        if (px === undefined || py === undefined) return { ...old, scale };
        const vw = size.w - RULER;
        const vh = size.h - RULER;
        const dx = px - RULER - vw / 2;
        const dy = py - RULER - vh / 2;
        const wx = old.cx + dx / old.scale;
        const wy = old.cy + dy / old.scale;
        return { cx: wx - dx / scale, cy: wy - dy / scale, scale };
      });
    },
    [size],
  );

  useEffect(() => onApi({ fit, zoomBy: (f) => zoomAt(f) }), [fit, zoomAt, onApi]);
  useEffect(() => publishZoom(v.scale / PX_PER_MM_100), [v.scale]);

  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const key = `${project.sheet.width}x${project.sheet.height}`;
    if (size.w > 100 && fitted.current !== key) {
      fitted.current = key;
      fit();
    }
  }, [size, fit, project.sheet.width, project.sheet.height]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // Wheel = zoom (default) unless the user switched to scroll mode; ⌘/Ctrl always zooms, Shift always scrolls.
      const zoom = e.ctrlKey || e.metaKey || (wheelZoomRef.current && !e.shiftKey);
      if (zoom) {
        // ~1.3× per mouse-wheel notch (deltaY ≈ 100), smooth for trackpads.
        const factor = Math.exp(-Math.max(-300, Math.min(300, e.deltaY * unit)) * 0.0026);
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

  // ---- selection geometry for handles (copy 0 of the selected element) ----
  const selRing = selection.kind === "ring" || selection.kind === "element" ? project.rings.find((r) => r.id === selection.ringId) : undefined;
  const selEl = selection.kind === "element" && selRing ? selRing.elements.find((e) => e.id === selection.elementId) : undefined;
  const sectorT = useMemo(() => (selRing ? instanceTransform(0, { count: selRing.repeat, radius: selRing.radius, phaseDeg: selRing.phase, rotationDeg: 0, rotationMode: "radial", direction: "outward", stagger: 0 }) : null), [selRing]);
  const elT = useMemo(() => (selEl && selRing ? elementTransform(selEl, selRing.radius) : null), [selEl, selRing]);
  const toWorld = (local: { x: number; y: number }): { x: number; y: number } => applyTransform(applyElementTransform(local, elT!), sectorT!);
  const worldToLocal = (p: { x: number; y: number }): { x: number; y: number } => invertElementTransform(invertTransform(p, sectorT!), elT!);
  const worldToSector = (p: { x: number; y: number }): { x: number; y: number } => invertTransform(p, sectorT!);

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: v.scale, mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, cx: v.cx, cy: v.cy };
      drag.current = null;
      cancelLongPress();
      setMarquee(null);
      return;
    }
    // Touch: long-press opens the context menu (there is no right button).
    if (e.pointerType === "touch" && e.button === 0 && !isPreview) {
      cancelLongPress();
      const x = e.clientX, y = e.clientY, pointerId = e.pointerId;
      longPress.current = {
        pointerId,
        x,
        y,
        timer: window.setTimeout(() => {
          longPress.current = null;
          drag.current = null;
          setMarquee(null);
          const el = document.elementFromPoint(x, y);
          const ringId = el?.getAttribute?.("data-ring");
          const elementId = el?.getAttribute?.("data-element");
          if (ringId === CENTER_ID) store.select({ kind: "center" });
          else if (ringId && elementId && !lockedIds.has(elementId) && !selectedIds.has(elementId)) store.select({ kind: "element", ringId, elementId });
          else if (ringId && !elementId && !lockedRingIds.has(ringId)) store.select({ kind: "ring", ringId });
          setMenu({ x, y });
        }, 550),
      };
    }
    const target = e.target as Element;
    // Pen / finger drawing takes priority over handles and selection.
    if (drawMode && e.button === 0) {
      cancelLongPress();
      const p = toDesign(e.clientX, e.clientY);
      drag.current = { kind: "draw", points: [p] };
      setStroke([p]);
      return;
    }
    const handle = target.getAttribute?.("data-handle");
    if (handle && selRing && e.button === 0) {
      const kind: HandleKind = handle === "origin" || handle === "rotate" || handle === "length" || handle === "width" || handle === "ring-radius" ? handle : Number(handle);
      if (kind === "ring-radius" || selEl) {
        drag.current = { kind: "handle", ringId: selRing.id, elementId: selEl?.id ?? null, handle: kind, moved: false };
        return;
      }
    }
    // Left-drag from empty space = marquee selection. Pan with the middle button, Alt, Space, touch, or from a shape.
    // Remember what was under the pointer: pointer capture retargets pointerup to the svg.
    const rawRing = target.getAttribute?.("data-ring") ?? null;
    const rawElement = target.getAttribute?.("data-element") ?? null;
    const shapeLocked = !!rawElement && lockedIds.has(rawElement);
    const hitRing = shapeLocked ? null : rawRing;
    const hitElement = shapeLocked ? null : rawElement;
    const onShape = !!rawRing;
    const panMode = e.button === 1 || e.altKey || spaceDown.current || (e.pointerType === "touch" && !boxSelect) || onShape || isPreview;
    if (!panMode) {
      const p = toDesign(e.clientX, e.clientY);
      drag.current = { kind: "marquee", sx: e.clientX, sy: e.clientY, x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey, moved: false, hitRing, hitElement };
      return;
    }
    drag.current = { kind: "pan", x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy, moved: false, hitRing, hitElement };
  };

  /**
   * Turn a drawn polyline (design mm) into a Bézier element of the selected ring
   * (or the last ring, or a new ring at the stroke's radius). The stroke is mapped
   * into the sector copy it was drawn in, so it appears where the pen went.
   */
  const finishStroke = (raw: { x: number; y: number }[]): void => {
    if (raw.length < 3) return;
    const length = polylineLength(raw);
    if (length < 2) return;
    const first = raw[0]!;
    const last = raw[raw.length - 1]!;
    const closed = length > 8 && Math.hypot(first.x - last.x, first.y - last.y) < Math.max(2.5, 12 / v.scale);
    // Smooth the pen samples (uniform resampling + Gaussian) so the fit yields a few
    // gentle cubic segments instead of following every jitter of the hand.
    const pts = conditionStroke(raw, closed, Math.max(0.35, Math.min(1, length / 60)));
    if (pts.length < 2) return;
    const err = Math.max(0.3, Math.min(0.8, length / 80));
    const bez = closed ? fitClosedPolygon(pts, err, 75) : cubicsToPoints(fitCurve(pts, err));
    if (bez.length < 4) return;
    const cxw = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cyw = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    let ring = selRing ?? project.rings[project.rings.length - 1];
    if (!ring) {
      ring = { ...nextRing(project), name: "Drawn", radius: Math.round(Math.hypot(cxw, cyw)), mirrorLocal: false };
      store.execute(addRing(ring));
    }
    // Sector copy the stroke was drawn in.
    const step = 360 / Math.max(1, ring.repeat);
    let k = Math.round((pointAngleDeg({ x: cxw, y: cyw }) - ring.phase) / step);
    k = ((k % ring.repeat) + ring.repeat) % ring.repeat;
    const T = instanceTransform(k, { count: ring.repeat, radius: ring.radius, phaseDeg: ring.phase, rotationDeg: 0, rotationMode: "radial", direction: "outward", stagger: 0 });
    const local = bez.map((q) => invertTransform(q, T));
    const anchors = local.filter((_, i) => i % 3 === 0);
    const cx = anchors.reduce((a, q) => a + q.x, 0) / anchors.length;
    const cy = anchors.reduce((a, q) => a + q.y, 0) / anchors.length;
    const r2 = (n: number): number => Math.round(n * 100) / 100;
    const el = newElement("bezier", {
      name: closed ? "drawn shape" : "drawn stroke",
      x: r2(cx),
      y: r2(cy),
      points: local.map((q) => ({ x: r2(q.x - cx), y: r2(q.y - cy) })),
      closed,
      strokeWidth: closed ? 0 : Math.max(1, project.constraints.minFeatureWidth * 1.5),
    });
    store.execute(addElement(ring.id, el));
    store.select({ kind: "element", ringId: ring.id, elementId: el.id });
  };

  /** Elements whose copies touch the rectangle (design mm). */
  const elementsIn = (x0: number, y0: number, x1: number, y1: number): { ringId: string; elementId: string }[] => {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const out: { ringId: string; elementId: string }[] = [];
    for (const ep of render.data.elementPaths) {
      if (ep.ringId === CENTER_ID) continue;
      const ring = project.rings.find((r) => r.id === ep.ringId);
      if (ring && !ring.visible) continue;
      if (lockedIds.has(ep.elementId)) continue;
      if (ep.boxes.some((b) => b[0] <= maxX && b[2] >= minX && b[1] <= maxY && b[3] >= minY)) out.push({ ringId: ep.ringId, elementId: ep.elementId });
    }
    return out;
  };

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (isPreview) return;
    const target = e.target as Element;
    const ringId = target.getAttribute?.("data-ring");
    const elementId = target.getAttribute?.("data-element");
    if (ringId === CENTER_ID) store.select({ kind: "center" });
    else if (ringId && elementId && lockedIds.has(elementId)) store.notify("ロックされた要素です。左のツリーから選択・ロック解除できます。");
    else if (ringId && elementId && !selectedIds.has(elementId)) store.select({ kind: "element", ringId, elementId });
    else if (ringId && !elementId && !lockedRingIds.has(ringId)) store.select({ kind: "ring", ringId });
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const ps = pinchStart.current;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (ps.scale * d) / Math.max(1, ps.dist)));
      // Two-finger drag pans by the midpoint movement (in mm at the new scale).
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      setV({ scale, cx: ps.cx - (mid.x - ps.mid.x) / scale, cy: ps.cy - (mid.y - ps.mid.y) / scale });
      return;
    }
    if (longPress.current && longPress.current.pointerId === e.pointerId && Math.hypot(e.clientX - longPress.current.x, e.clientY - longPress.current.y) > 8) cancelLongPress();
    const p = toDesign(e.clientX, e.clientY);
    publishCursor({ x: p.x, y: p.y, r: Math.hypot(p.x, p.y), angle: ((pointAngleDeg(p) % 360) + 360) % 360 });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "handle") {
      d.moved = true;
      if (!sectorT) return;
      const snap = e.shiftKey;
      if (d.handle === "ring-radius" && selRing) {
        // Drag along the sector axis: new radius = distance from the mandala center.
        const r = Math.hypot(p.x, p.y);
        const val = snap ? Math.round(r) : Math.round(r * 10) / 10;
        store.execute(updateRing(d.ringId, { radius: Math.max(0, val) }, "半径を変更"));
        return;
      }
      if (!elT || !selEl || !d.elementId) return;
      const s = worldToSector(p);
      if (d.handle === "origin") {
        // Snap to the sector axis (y = 0) when close: a mirrored ring would otherwise split the
        // element into a pair as soon as it leaves the axis. Alt disables the snap.
        const snapPx = coarse ? 14 : 8;
        const y = !e.altKey && Math.abs(s.y) * v.scale < snapPx ? 0 : s.y;
        store.execute(updateElement(d.ringId, d.elementId, { x: Math.round(s.x * 10) / 10, y: Math.round(y * 10) / 10 }, "要素を移動"));
      } else if (d.handle === "rotate") {
        // Angle of the pointer around the element origin, minus the automatic radial orientation.
        const radial = selEl.orient === "radial" ? Math.atan2(selEl.y, selEl.x + selRing!.radius) : 0;
        let deg = ((Math.atan2(s.y - selEl.y, s.x - selEl.x) - radial) * 180) / Math.PI;
        if (snap) deg = Math.round(deg / 15) * 15;
        deg = Math.round((((deg + 540) % 360) - 180) * 10) / 10;
        store.execute(updateElement(d.ringId, d.elementId, { rotation: deg }, "要素を回転"));
      } else if (d.handle === "length" || d.handle === "width") {
        // Project the pointer onto the element axis / normal (local frame) to size the shape.
        const local = worldToLocal(p);
        if (d.handle === "length") {
          let len = Math.max(0.2, Math.abs(local.x) * 2);
          if (snap) len = Math.round(len);
          store.execute(updateElement(d.ringId, d.elementId, { length: Math.round(len * 10) / 10 }, "長さを変更"));
        } else {
          let wid = Math.max(0.2, Math.abs(local.y) * 2);
          if (snap) wid = Math.round(wid);
          store.execute(updateElement(d.ringId, d.elementId, { width: Math.round(wid * 10) / 10 }, "幅を変更"));
        }
      } else if (typeof d.handle === "number") {
        store.execute(setBezierPoint(d.ringId, d.elementId, d.handle, worldToLocal(p)));
      }
      return;
    }
    if (d.kind === "draw") {
      const last = d.points[d.points.length - 1]!;
      if (Math.hypot(p.x - last.x, p.y - last.y) * v.scale >= 1.5) {
        d.points.push(p);
        setStroke(d.points.slice());
      }
      return;
    }
    if (d.kind === "marquee") {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      d.moved = true;
      d.x1 = p.x;
      d.y1 = p.y;
      setMarquee({ x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 });
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    setV((old) => ({ ...old, cx: d.cx - dx / old.scale, cy: d.cy - dy / old.scale }));
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    if (longPress.current && longPress.current.pointerId === e.pointerId) cancelLongPress();
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    const d = drag.current;
    drag.current = null;
    if (d && d.kind === "draw") {
      setStroke(null);
      finishStroke(d.points);
      return;
    }
    if (d && d.kind === "marquee") {
      setMarquee(null);
      if (d.moved) {
        const hit = elementsIn(d.x0, d.y0, d.x1, d.y1);
        store.selectMany(d.shift ? [...selectedItems(selection), ...hit] : hit);
        return;
      }
    }
    if (d && (d.kind === "pan" || d.kind === "marquee") && !d.moved && e.button === 0) {
      const ringId = d.hitRing;
      const elementId = d.hitElement;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (ringId === CENTER_ID) store.select({ kind: "center" });
      else if (ringId && elementId && additive) store.toggleSelect(ringId, elementId);
      else if (ringId && elementId) store.select({ kind: "element", ringId, elementId });
      else if (ringId) store.select({ kind: "ring", ringId });
      else if (!additive) store.select({ kind: "project" });
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
  const px = 1 / v.scale;
  /** Handle size unit: bigger targets on touch screens. */
  const hp = px * (coarse ? 1.8 : 1);
  const guideR = Math.max(sheetW, sheetH) * 0.75;
  const d = render.data;
  const errorIssues = d.issuePaths.filter((i) => i.severity === "error");
  const warnIssues = d.issuePaths.filter((i) => i.severity !== "error");
  const selRingId = selRing?.id ?? null;
  const isMaterial = view.mode === "material";
  const positive = d.polarity === "positive";
  const isPreview = view.mode === "preview";
  const bg = isMaterial ? "#5b6470" : "#e9edf1";

  const elementFill = (ep: { ringId: string; elementId: string; mode: "cut" | "keep" }): string => {
    const selected = selectedIds.has(ep.elementId) || (selection.kind === "ring" && ep.ringId === selRingId) || (selection.kind === "center" && ep.ringId === CENTER_ID);
    const hovered = ep.elementId === hoverEl || (hoverEl === null && ep.ringId === hoverRing);
    if (ep.mode === "keep") return selected ? "#8fc3a5" : hovered ? "#b7dcc5" : "#cfe6d8";
    return selected ? "#2f7bb5" : hovered ? "#5a86ad" : "#3b4f63";
  };

  // Sector guide for the selected ring.
  const sectorGuide = useMemo(() => {
    if (!selRing || !view.guides || !view.sectorGuide) return null;
    const half = 180 / Math.max(1, selRing.repeat);
    const a0 = ((selRing.phase - 90) * Math.PI) / 180;
    const rOut = Math.max(sheetW, sheetH) * 0.7;
    const line = (deg: number) => ({ x: Math.cos(a0 + (deg * Math.PI) / 180) * rOut, y: Math.sin(a0 + (deg * Math.PI) / 180) * rOut });
    return { axis: line(0), edgeA: line(half), edgeB: line(-half), radius: selRing.radius, mirror: selRing.mirrorLocal };
  }, [selRing, view.guides, view.sectorGuide, sheetW, sheetH]);

  const selLocked = !!selRing && isLocked(project, selRing.id, selEl?.id ?? null);
  const handles = useMemo(() => {
    if (!selEl || !sectorT || !elT || selLocked) return null;
    const origin = applyTransform({ x: selEl.x, y: selEl.y }, sectorT);
    const axisTip = applyTransform(applyElementTransform({ x: selEl.length / 2, y: 0 }, elT), sectorT);
    const widthTip = applyTransform(applyElementTransform({ x: 0, y: selEl.width / 2 }, elT), sectorT);
    const rotateTip = applyTransform(applyElementTransform({ x: selEl.length / 2 + 6 / v.scale + 2, y: 0 }, elT), sectorT);
    const points = selEl.type === "bezier" ? selEl.points.map((p) => applyTransform(applyElementTransform(p, elT), sectorT)) : [];
    return { origin, axisTip, widthTip, rotateTip, points };
  }, [selEl, sectorT, elT, v.scale, selLocked]);
  const ringHandle = useMemo(() => (selRing && sectorT && !selEl && !selLocked ? applyTransform({ x: 0, y: 0 }, sectorT) : null), [selRing, sectorT, selEl, selLocked]);

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 select-none overflow-hidden" style={{ touchAction: "none", background: bg }}>
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
        style={{ left: view.rulers ? RULER : 0, top: view.rulers ? RULER : 0, touchAction: "none", cursor: drawMode ? "crosshair" : undefined }}
        width={vw}
        height={vh}
        viewBox={viewBox}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        data-draw-mode={drawMode ? "1" : undefined}
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
          <pattern id="keep-hatch" width={1.2} height={1.2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={1.2} stroke="#3f8f6b" strokeWidth={0.3} />
          </pattern>
          <filter id="sheet-shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx={0} dy={2 * px} stdDeviation={6 * px} floodColor="#1f2d3a" floodOpacity={0.25} />
          </filter>
        </defs>

        {/* Sheet */}
        <path d={sheetPath} fill={positive && isMaterial && !isPreview ? "#8a939e" : "#ffffff"} filter="url(#sheet-shadow)" />
        {view.grid && view.mode !== "material" && !isPreview && <path d={sheetPath} fill="url(#grid-major)" />}

        {/* Reference image overlay */}
        {reference && reference.visible && view.diff !== "generated" && (
          <image
            href={reference.url}
            x={-reference.widthMm / 2}
            y={-(reference.widthMm * reference.pxHeight) / reference.pxWidth / 2}
            width={reference.widthMm}
            height={(reference.widthMm * reference.pxHeight) / reference.pxWidth}
            opacity={view.diff === "reference" ? 1 : reference.opacity}
            transform={`translate(${reference.x} ${reference.y}) rotate(${reference.rotation})`}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}

        {/* Guides */}
        {view.guides && !isPreview && (
          <g pointerEvents="none">
            <line x1={-guideR} y1={0} x2={guideR} y2={0} stroke="#9fb3c8" strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
            <line x1={0} y1={-guideR} x2={0} y2={guideR} stroke="#9fb3c8" strokeWidth={px} strokeDasharray={`${6 * px} ${4 * px}`} />
            {Array.from({ length: project.symmetry }, (_, i) => {
              const a = ((360 / project.symmetry) * i - 90) * (Math.PI / 180);
              return <line key={i} x1={0} y1={0} x2={Math.cos(a) * guideR} y2={Math.sin(a) * guideR} stroke="#c9d5e0" strokeWidth={px} strokeDasharray={`${2 * px} ${4 * px}`} />;
            })}
            {sectorGuide && (
              <>
                <path d={`M0 0L${sectorGuide.edgeA.x} ${sectorGuide.edgeA.y}`} stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
                <path d={`M0 0L${sectorGuide.edgeB.x} ${sectorGuide.edgeB.y}`} stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
                <path d={`M0 0L${sectorGuide.axis.x} ${sectorGuide.axis.y}`} stroke={sectorGuide.mirror ? "#c8793f" : "#2f7bb5"} strokeWidth={px} opacity={0.8} />
                <circle r={sectorGuide.radius} fill="none" stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${4 * px} ${4 * px}`} opacity={0.7} />
              </>
            )}
          </g>
        )}

        {/* Manufacturing preview: only the cut lines the SVG export writes (red hairlines), no overlays. */}
        {isPreview && (
          <g pointerEvents="none">
            {project.sheet.outline && <path d={sheetPath} fill="none" stroke="#d84435" strokeWidth={Math.max(0.15, px)} />}
            <path d={d.exportPath} fillRule="evenodd" fill="none" stroke="#d84435" strokeWidth={Math.max(0.15, px)} strokeLinejoin="round" />
          </g>
        )}
        {/* Geometry */}
        {isPreview ? null : view.mode === "design" ? (
          <g>
            {d.elementPaths.map((ep) => (
              <ElementPath key={`${ep.ringId}/${ep.elementId}`} ringId={ep.ringId} elementId={ep.elementId} d={ep.d} fill={elementFill(ep)} fillOpacity={ep.mode === "keep" ? 0.9 : 0.85} stroke={ep.mode === "keep" ? "#3f8f6b" : "none"} strokeWidth={px} onEnter={onEnter} onLeave={onLeave} />
            ))}
            {d.islandPath && <path d={d.islandPath} fill="#f7c6c0" fillOpacity={0.6} stroke="#d84435" strokeWidth={px} pointerEvents="none" />}
          </g>
        ) : (
          <g>
            {view.diff === "reference" ? null : view.diff === "overlap" ? (
              <path d={d.finalPath} fillRule="evenodd" fill="#2f7bb5" fillOpacity={0.45} stroke="#1f5f8f" strokeWidth={Math.max(0.12, px)} />
            ) : (
              positive ? (
              isMaterial ? (
                <path d={d.materialPath} fillRule="evenodd" fill="#ffffff" stroke="none" />
              ) : (
                <>
                  <path d={d.wastePath} fillRule="evenodd" fill="#111111" stroke="none" />
                  <path d={d.finalPath} fillRule="evenodd" fill="none" stroke="#d84435" strokeWidth={Math.max(0.12, px)} />
                </>
              )
            ) : (
              <path d={d.finalPath} fillRule="evenodd" fill={isMaterial ? bg : "#111111"} stroke={isMaterial ? "none" : "#d84435"} strokeWidth={Math.max(0.12, px)} />
            )
            )}
            {d.elementPaths.map((ep) => {
              const active = selectedIds.has(ep.elementId) || ep.elementId === hoverEl || (hoverEl === null && ep.ringId === hoverRing) || (selection.kind === "ring" && ep.ringId === selRingId);
              return <ElementPath key={`${ep.ringId}/${ep.elementId}`} ringId={ep.ringId} elementId={ep.elementId} d={ep.d} fill={active ? "#2f7bb5" : "transparent"} fillOpacity={0.35} stroke="none" strokeWidth={0} onEnter={onEnter} onLeave={onLeave} />;
            })}
          </g>
        )}

        {view.showBridges && !isPreview && d.bridgePath && <path d={d.bridgePath} fill="#f6b26b" fillOpacity={0.8} stroke="#e08a2e" strokeWidth={px} pointerEvents="none" />}
        {view.showBridges && !isPreview && d.connectorPath && <path d={d.connectorPath} fill="#8fc3a5" fillOpacity={0.85} stroke="#3f8f6b" strokeWidth={px} pointerEvents="none" data-testid="connectors" />}
        {!isPreview && d.strayPath && <path d={d.strayPath} fill="#f7c6c0" fillOpacity={0.5} stroke="#d84435" strokeWidth={1.5 * px} strokeDasharray={`${3 * px} ${2 * px}`} pointerEvents="none" data-testid="stray" />}

        {view.showIssues && !isPreview && (
          <g pointerEvents="none">
            {warnIssues.map((i) => (
              <path key={i.id} d={i.d} fillRule="evenodd" fill="#f4c542" fillOpacity={i.id === focusedIssue ? 0.75 : 0.4} stroke="#d99a1e" strokeWidth={(i.id === focusedIssue ? 2 : 1) * px} />
            ))}
            {errorIssues.map((i) => (
              <path key={i.id} d={i.d} fillRule="evenodd" fill="#ff4d4d" fillOpacity={i.id === focusedIssue ? 0.75 : 0.45} stroke="#c62828" strokeWidth={(i.id === focusedIssue ? 2 : 1) * px} />
            ))}
          </g>
        )}

        {/* Handles of the selected element (copy 0). */}
        {handles && !isPreview && !drawMode && (
          <g>
            <line x1={handles.origin.x} y1={handles.origin.y} x2={handles.axisTip.x} y2={handles.axisTip.y} stroke="#2f7bb5" strokeWidth={px} pointerEvents="none" />
            {handles.points.length > 0 && (
              <path
                d={handles.points.map((p, i) => `${i === 0 ? "M" : i % 3 === 1 ? "M" : "L"}${p.x} ${p.y}`).join("")}
                fill="none"
                stroke="#1f7ac0"
                strokeWidth={px}
                strokeDasharray={`${3 * px} ${3 * px}`}
                pointerEvents="none"
              />
            )}
            {handles.points.map((p, i) => {
              const anchor = i % 3 === 0;
              return <circle key={i} data-handle={i} cx={p.x} cy={p.y} r={(anchor ? 5 : 4) * px} fill={anchor ? "#1f7ac0" : "#ffffff"} stroke="#1f7ac0" strokeWidth={1.2 * hp} style={{ cursor: "move" }} aria-label={anchor ? "アンカーポイント" : "制御点"} />;
            })}
            {selEl && selEl.type !== "bezier" && selEl.type !== "connector" && selEl.type !== "compound" && (
              <>
                <line x1={handles.origin.x} y1={handles.origin.y} x2={handles.widthTip.x} y2={handles.widthTip.y} stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} pointerEvents="none" />
                <rect data-handle="length" x={handles.axisTip.x - 4 * hp} y={handles.axisTip.y - 4 * hp} width={8 * hp} height={8 * hp} fill="#2f7bb5" stroke="#ffffff" strokeWidth={px} style={{ cursor: "ew-resize" }} aria-label="長さ" />
                <rect data-handle="width" x={handles.widthTip.x - 4 * hp} y={handles.widthTip.y - 4 * hp} width={8 * hp} height={8 * hp} fill="#2f7bb5" stroke="#ffffff" strokeWidth={px} style={{ cursor: "ns-resize" }} aria-label="幅" />
              </>
            )}
            <line x1={handles.axisTip.x} y1={handles.axisTip.y} x2={handles.rotateTip.x} y2={handles.rotateTip.y} stroke="#c8793f" strokeWidth={px} pointerEvents="none" />
            <circle data-handle="rotate" cx={handles.rotateTip.x} cy={handles.rotateTip.y} r={5.5 * hp} fill="#ffffff" stroke="#c8793f" strokeWidth={1.4 * hp} style={{ cursor: "grab" }} aria-label="回転（Shift で 15° 刻み）" />
            <rect data-handle="origin" x={handles.origin.x - 5 * hp} y={handles.origin.y - 5 * hp} width={10 * hp} height={10 * hp} fill="#ffffff" stroke="#2f7bb5" strokeWidth={1.2 * hp} style={{ cursor: "move" }} aria-label="要素の位置" />
          </g>
        )}
        {ringHandle && !isPreview && (
          <g>
            <line x1={0} y1={0} x2={ringHandle.x} y2={ringHandle.y} stroke="#2f7bb5" strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} pointerEvents="none" />
            <circle data-handle="ring-radius" cx={ringHandle.x} cy={ringHandle.y} r={6 * hp} fill="#ffffff" stroke="#2f7bb5" strokeWidth={1.4 * hp} style={{ cursor: "move" }} aria-label="リングの半径" />
          </g>
        )}

        {stroke && stroke.length > 1 && <path d={stroke.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("")} fill="none" stroke="#c8793f" strokeWidth={1.8 * px} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" data-testid="stroke" />}
        {marquee && (
          <rect
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            fill="#2f7bb5"
            fillOpacity={0.12}
            stroke="#2f7bb5"
            strokeWidth={px}
            strokeDasharray={`${4 * px} ${3 * px}`}
            pointerEvents="none"
            data-testid="marquee"
          />
        )}

        <g pointerEvents="none">
          <circle r={3 * px} fill="none" stroke="#c8793f" strokeWidth={px} />
          <line x1={-6 * px} y1={0} x2={6 * px} y2={0} stroke="#c8793f" strokeWidth={px} />
          <line x1={0} y1={-6 * px} x2={0} y2={6 * px} stroke="#c8793f" strokeWidth={px} />
        </g>
      </svg>

      <ContextMenu store={store} at={menu} onClose={closeMenu} fit={fit} />
      <div className="absolute bottom-3 right-3 flex items-center gap-1">
        <button type="button" className={`canvas-btn text-[10px] ${drawMode ? "border-accent bg-accent text-white" : ""}`} onClick={() => setDrawMode((m) => !m)} title="描く: ペン・指・マウスでなぞった線を Bézier 要素にする（始点に戻ると閉じた形）" data-testid="draw-mode">
          {drawMode ? "✎ 描く: ON" : "✎ 描く"}
        </button>
        {coarse && (
          <button type="button" className={`canvas-btn text-[10px] ${boxSelect ? "border-select text-select" : ""}`} onClick={() => setBoxSelect((b) => !b)} title="1 本指ドラッグを範囲選択にする（オフでパン）" data-testid="box-select">
            {boxSelect ? "⬚ 範囲選択: ON" : "⬚ 範囲選択"}
          </button>
        )}
        {!coarse && (
        <button
          type="button"
          className={`canvas-btn text-[10px] ${wheelZoom ? "" : "opacity-70"}`}
          title="ホイールの動作: ズーム / スクロール（⌘/Ctrl+ホイールは常にズーム、Shift+ホイールは常にスクロール）"
          onClick={() => {
            const next = !wheelZoom;
            setWheelZoom(next);
            try {
              localStorage.setItem(WHEEL_KEY, next ? "zoom" : "scroll");
            } catch {
              /* ignore */
            }
          }}
        >
          {wheelZoom ? "ホイール: ズーム" : "ホイール: スクロール"}
        </button>
        )}
        <button type="button" className="canvas-btn" onClick={() => zoomAt(1 / 1.25)} title="縮小">
          −
        </button>
        <button type="button" className="canvas-btn min-w-[52px] font-mono" onClick={fit} title="全体表示 (F)">
          {Math.round((v.scale / PX_PER_MM_100) * 100)}%
        </button>
        <button type="button" className="canvas-btn" onClick={() => zoomAt(1.25)} title="拡大">
          +
        </button>
      </div>
      <div className="pointer-events-none absolute left-8 top-8 hidden max-w-[70%] rounded bg-paper/85 px-2 py-1 text-[11px] text-ink-2 shadow-sm md:block">
        {isPreview
          ? `加工プレビュー: 書き出される SVG と同じカットライン（赤・${d.exportSubpaths} パス）。ブリッジは線の切れ目として含まれています`
          : view.diff !== "off" && reference
          ? view.diff === "reference"
            ? "Difference View: 参照画像のみ"
            : view.diff === "generated"
              ? "Difference View: 生成形状のみ"
              : "Difference View: 参照画像の上に生成形状（青）を重ねて表示"
          : view.mode === "design"
            ? positive
              ? "デザイン表示: 要素ごとの形状（緑 = コネクタ、赤破線 = 分離した部品）"
              : "デザイン表示: 要素ごとの形状（緑 = keep、赤 = 脱落する島）"
            : view.mode === "material"
              ? positive
                ? "材料ビュー（Positive）: 残る曼荼羅が白、除去される部分は背景色"
                : "材料ビュー: 残る材料が白、抜ける部分は背景色"
              : positive
                ? "除去ビュー（Positive）: 除去される領域が黒、残る曼荼羅が白（赤線 = カットライン）"
                : "抜きビュー: レーザーで抜ける領域が黒（赤線 = カットライン）"}
        {render.stale && <span className="ml-2 text-warn">計算中…</span>}
      </div>
      <div className={`pointer-events-none absolute bottom-3 left-8 hidden max-w-[calc(100%-360px)] truncate text-[10px] md:block ${isMaterial ? "text-white/70" : "text-ink-3"}`}>
        ドラッグ: 範囲選択（Alt / Space / 中ボタン: パン） · Shift+クリック: 追加選択 · 右クリック: メニュー · {wheelZoom ? "ホイール: ズーム" : "ホイール: スクロール（⌘/Ctrl でズーム）"} · 矢印 / [ ]: 移動・回転
      </div>
    </div>
  );
}
