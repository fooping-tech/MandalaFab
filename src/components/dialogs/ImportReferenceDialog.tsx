/**
 * Import Reference wizard: upload → crop → threshold → center → symmetry →
 * sector preview → vectorize → convert → validate. Image analysis runs in the
 * import worker; this component only draws previews and collects settings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replaceProject } from "../../editor/commands";
import type { EditorStore } from "../../editor/store";
import { ImportClient, type PreprocessReply } from "../../import/client";
import type { CenterCandidate } from "../../import/center-detect";
import { DEFAULT_PREPROCESS, type PreprocessOptions } from "../../import/preprocess";
import type { ConversionResult, ImportMode } from "../../import/project-converter";
import { SYMMETRY_CANDIDATES, type BandSymmetry, type SymmetryResult } from "../../import/symmetry-detect";
import type { TracedContour } from "../../import/types";
import { NumberField, SelectField, SmallButton, Toggle } from "../fields";
import { Dialog } from "./Dialog";

const STEPS = ["Crop", "Threshold", "Center", "Symmetry", "Sector", "Vectorize", "Convert", "Validate"] as const;
type Step = (typeof STEPS)[number];

interface Loaded {
  file: File;
  url: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function decodeFile(file: File): Promise<Loaded> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    img.src = url;
  });
  // Limit analysis size to 2048 px on the long side.
  const scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  return { file, url, width: w, height: h, rgba };
}

/** Data URL of the cropped image for the reference layer. */
function cropToDataUrl(loaded: Loaded, crop: Crop): string {
  const c = document.createElement("canvas");
  c.width = Math.round(crop.w);
  c.height = Math.round(crop.h);
  const ctx = c.getContext("2d")!;
  const src = document.createElement("canvas");
  src.width = loaded.width;
  src.height = loaded.height;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(loaded.rgba), loaded.width, loaded.height), 0, 0);
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function ImportReferenceDialog({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const client = useMemo(() => new ImportClient(), []);
  useEffect(() => () => client.dispose(), [client]);
  const [step, setStep] = useState<Step>("Crop");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pre, setPre] = useState<PreprocessOptions>(DEFAULT_PREPROCESS);
  const [preReply, setPreReply] = useState<PreprocessReply | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [centerCands, setCenterCands] = useState<CenterCandidate[]>([]);
  const [symmetry, setSymmetry] = useState(12);
  const [symRes, setSymRes] = useState<(SymmetryResult & { bands: BandSymmetry[] }) | null>(null);
  const [perBand, setPerBand] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [phase, setPhase] = useState(0);
  const [minAreaPx, setMinAreaPx] = useState(4);
  const [contours, setContours] = useState<TracedContour[] | null>(null);
  const [strokePx, setStrokePx] = useState(0);
  const [mode, setMode] = useState<ImportMode>("stencil");
  const [modeAuto, setModeAuto] = useState(true);
  const [widthMm, setWidthMm] = useState(150);
  const [recognize, setRecognize] = useState(true);
  const [ringDetect, setRingDetect] = useState(true);
  const [simplifyMm, setSimplifyMm] = useState(0.15);
  const [bezierErr, setBezierErr] = useState(0.25);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [validation, setValidation] = useState<{ subpaths: number; islands: number; bridges: number; issues: number; errors: number } | null>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<null | { kind: "crop"; x0: number; y0: number } | { kind: "center" }>(null);

  const stepIndex = STEPS.indexOf(step);
  const project = store.getState().project;

  // ---- file loading ----
  const onFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    setError(null);
    setBusy("画像を読み込み中…");
    try {
      const l = await decodeFile(file);
      setLoaded(l);
      setCrop({ x: 0, y: 0, w: l.width, h: l.height });
      await client.setImage(l.width, l.height, l.rgba);
      setPreReply(null);
      setContours(null);
      setResult(null);
      setWidthMm(Math.min(project.sheet.width, project.sheet.height));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // ---- preprocess ----
  const runPreprocess = useCallback(async (): Promise<PreprocessReply | null> => {
    if (!loaded || !crop) return null;
    setBusy("二値化中…");
    try {
      const r = await client.preprocess(pre, crop, 720);
      setPreReply(r);
      const c = document.createElement("canvas");
      c.width = r.preview.width;
      c.height = r.preview.height;
      c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.preview.data), r.preview.width, r.preview.height), 0, 0);
      setPreviewUrl(c.toDataURL());
      setContours(null);
      setResult(null);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, [client, loaded, crop, pre]);

  useEffect(() => {
    if (step === "Threshold" && loaded) void runPreprocess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pre]);

  const detectCenter = async (): Promise<void> => {
    setBusy("中心を推定中…");
    try {
      const cands = await client.center();
      setCenterCands(cands);
      if (cands[0]) setCenter(cands[0].point);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const detectSym = async (): Promise<void> => {
    if (!center) return;
    setBusy("対称数を推定中…");
    try {
      const r = await client.symmetry(center);
      setSymRes(r);
      setSymmetry(r.best);
      setCenter(r.center);
      // Per-band symmetry is the default when confident bands disagree with the global n.
      const confident = r.bands.filter((bd) => bd.corr >= 0.5);
      setPerBand(confident.some((bd) => bd.n !== r.best));
      setMirror(r.mirrorAxisDeg !== null);
      setPhase(r.mirrorAxisDeg ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runTrace = async (cellsMode?: boolean): Promise<void> => {
    setBusy("輪郭を抽出中…");
    try {
      const useCells = cellsMode ?? mode === "cells";
      const r = await client.trace(minAreaPx, useCells);
      setContours(r.contours);
      setStrokePx(r.strokePx);
      setResult(null);
      // Line art (thin strokes) is best stencilled by cutting the enclosed cells.
      if (modeAuto && preReply) {
        const strokeMm = r.strokePx * (widthMm / preReply.width);
        const suggested: ImportMode = strokeMm > 0 && strokeMm < project.constraints.minFeatureWidth * 1.2 ? "cells" : "stencil";
        if (suggested !== mode) {
          setMode(suggested);
          if (suggested === "cells" && !useCells) {
            const r2 = await client.trace(minAreaPx, true);
            setContours(r2.contours);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runConvert = async (): Promise<void> => {
    if (!preReply || !center) return;
    setBusy("曼荼羅プロジェクトへ変換中…");
    try {
      const mmPerPx = widthMm / preReply.width;
      const bands = perBand && symRes ? symRes.bands.map((bd) => ({ rMinMm: bd.rMin * mmPerPx, rMaxMm: bd.rMax * mmPerPx, n: bd.corr >= 0.5 ? bd.n : symmetry, mirrorAxisDeg: bd.mirrorAxisDeg })) : undefined;
      const r = await client.convert({
        symmetry,
        bands,
        phaseDeg: phase,
        mirror,
        center,
        mmPerPx,
        sheet: { width: project.sheet.width, height: project.sheet.height },
        mode,
        simplifyMm,
        bezierErrorMm: bezierErr,
        recognize,
        ringDetect,
        minFeatureWidth: project.constraints.minFeatureWidth,
        minHoleDiameter: project.constraints.minHoleDiameter,
        minGap: project.constraints.minGap,
        name: loaded ? loaded.file.name.replace(/\.[^.]+$/, "") : "Imported",
      });
      r.project.constraints = { ...project.constraints };
      r.project.bridges = { ...project.bridges, auto: mode !== "trace" };
      setResult(r);
      setValidation(null);
      setBusy("ステンシル検証中…");
      const st = await client.stencilStats(r.project);
      setValidation({ subpaths: st.subpaths, islands: st.islands, bridges: st.bridges, issues: st.issues, errors: st.errors });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const goto = async (next: Step): Promise<void> => {
    setError(null);
    if (next === "Center" && !center && preReply) await detectCenter();
    if (next === "Symmetry" && !symRes && center) await detectSym();
    if (next === "Vectorize" && !contours) await runTrace();
    if (next === "Convert" && !result && contours) await runConvert();
    setStep(next);
  };

  const apply = (): void => {
    if (!result || !loaded || !crop || !preReply) return;
    store.execute(replaceProject(result.project, `参照画像から変換: ${result.project.name}`));
    const mmPerPx = widthMm / preReply.width;
    const cx = center ? (center.x - preReply.width / 2) * mmPerPx : 0;
    const cy = center ? (center.y - preReply.height / 2) * mmPerPx : 0;
    store.setReference({ url: cropToDataUrl(loaded, crop), pxWidth: preReply.width, pxHeight: preReply.height, widthMm, x: -cx, y: -cy, rotation: 0, opacity: 0.35, visible: true });
    store.setView({ mode: "material", diff: "off" });
    store.notify(`参照画像を ${result.stats.elements} 要素・${result.stats.rings} リング（${symmetry} 分割）の編集可能なプロジェクトに変換しました。`, "success");
    onClose();
  };

  // ---- preview drawing (crop / center / sector overlay) ----
  const previewScale = preReply ? preReply.preview.scale : 1;
  const displayW = loaded ? Math.min(720, loaded.width) : 0;
  const displayScale = loaded ? displayW / loaded.width : 1;

  useEffect(() => {
    const c = previewCanvas.current;
    if (!c || !loaded) return;
    const ctx = c.getContext("2d")!;
    if (step === "Crop") {
      c.width = Math.round(loaded.width * displayScale);
      c.height = Math.round(loaded.height * displayScale);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, c.width, c.height);
        if (crop) {
          ctx.fillStyle = "rgba(30,40,50,0.45)";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.clearRect(crop.x * displayScale, crop.y * displayScale, crop.w * displayScale, crop.h * displayScale);
          ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, crop.x * displayScale, crop.y * displayScale, crop.w * displayScale, crop.h * displayScale);
          ctx.strokeStyle = "#c8793f";
          ctx.lineWidth = 2;
          ctx.strokeRect(crop.x * displayScale, crop.y * displayScale, crop.w * displayScale, crop.h * displayScale);
        }
      };
      img.src = loaded.url;
      return;
    }
    if (!previewUrl || !preReply) return;
    const img = new Image();
    img.onload = () => {
      c.width = img.width;
      c.height = img.height;
      ctx.drawImage(img, 0, 0);
      const s = previewScale;
      if (center && step !== "Threshold") {
        const cx = center.x * s;
        const cy = center.y * s;
        ctx.strokeStyle = "#d84435";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy);
        ctx.lineTo(cx + 12, cy);
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx, cy + 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.stroke();
        if (step === "Symmetry" || step === "Sector" || step === "Vectorize" || step === "Convert" || step === "Validate") {
          const R = Math.max(c.width, c.height);
          ctx.save();
          ctx.translate(cx, cy);
          for (let i = 0; i < symmetry; i++) {
            const a = ((phase + (360 / symmetry) * i - 90 - 180 / symmetry) * Math.PI) / 180;
            ctx.strokeStyle = i === 0 || i === 1 ? "#2f7bb5" : "rgba(47,123,181,0.35)";
            ctx.lineWidth = i === 0 || i === 1 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            ctx.stroke();
          }
          if (mirror) {
            const a = ((phase - 90) * Math.PI) / 180;
            ctx.strokeStyle = "#c8793f";
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        }
      }
      if (contours && (step === "Vectorize" || step === "Convert" || step === "Validate")) {
        ctx.lineWidth = 1;
        for (const ct of contours) {
          ctx.strokeStyle = ct.hole ? "#3f8f6b" : "#2f7bb5";
          ctx.beginPath();
          ct.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
          ctx.closePath();
          ctx.stroke();
        }
      }
    };
    img.src = previewUrl;
  }, [step, loaded, crop, previewUrl, preReply, center, symmetry, phase, mirror, contours, displayScale, previewScale]);

  const canvasPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const c = previewCanvas.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };
  const onPointerDown = (e: React.PointerEvent): void => {
    if (!loaded) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    if (step === "Crop") {
      dragging.current = { kind: "crop", x0: p.x / displayScale, y0: p.y / displayScale };
      setCrop({ x: p.x / displayScale, y: p.y / displayScale, w: 1, h: 1 });
    } else if (step === "Center") {
      dragging.current = { kind: "center" };
      setCenter({ x: p.x / previewScale, y: p.y / previewScale });
    }
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragging.current;
    if (!d || !loaded) return;
    const p = canvasPoint(e);
    if (d.kind === "crop") {
      const x1 = Math.max(0, Math.min(loaded.width, p.x / displayScale));
      const y1 = Math.max(0, Math.min(loaded.height, p.y / displayScale));
      setCrop({ x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), w: Math.max(2, Math.abs(x1 - d.x0)), h: Math.max(2, Math.abs(y1 - d.y0)) });
    } else {
      setCenter({ x: p.x / previewScale, y: p.y / previewScale });
      setSymRes(null);
    }
  };
  const onPointerUp = (): void => {
    dragging.current = null;
  };

  const lowConf = result ? result.elements.filter((e) => e.confidence < 0.7) : [];

  return (
    <Dialog open onClose={onClose} title="参照画像のインポート（Import Reference）" width={1100}>
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div>
          <ol className="mb-3 flex flex-wrap gap-1 text-[11px]">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button type="button" disabled={!loaded || (i > 0 && !preReply && i > 1)} className={`rounded px-2 py-0.5 ${s === step ? "bg-select text-white" : i < stepIndex ? "bg-select-bg text-select" : "bg-panel-2 text-ink-3"}`} onClick={() => void goto(s)}>
                  {i + 1}. {s}
                </button>
              </li>
            ))}
          </ol>
          {!loaded ? (
            <label className="flex h-[420px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-[13px] text-ink-2 hover:border-select" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0] ?? null); }}>
              <span className="text-[28px]">🖼</span>
              <span className="mt-2">PNG / JPG / WebP / SVG をドロップ、またはクリックして選択</span>
              <span className="mt-1 text-[11px] text-ink-3">手描きの曼荼羅でも構いません。解析は 2048 px 以下に縮小して行います。</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <div className="relative overflow-auto rounded border border-line bg-panel-2" style={{ maxHeight: 560 }}>
              <canvas ref={previewCanvas} className="block max-w-full" style={{ cursor: step === "Crop" ? "crosshair" : step === "Center" ? "move" : "default", touchAction: "none" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-ink-2">{busy}</div>}
            </div>
          )}
          {error && <p className="mt-2 text-[12px] text-error">{error}</p>}
        </div>

        <div className="grid content-start gap-3 text-[12px]">
          {step === "Crop" && (
            <>
              <h3 className="font-semibold">1. Crop</h3>
              <p className="text-[11px] text-ink-3">曼荼羅を囲むようにドラッグして切り抜きます（省略可）。</p>
              {loaded && crop && (
                <div className="text-[11px] text-ink-2">
                  画像 {loaded.width} × {loaded.height} px · 切り抜き {Math.round(crop.w)} × {Math.round(crop.h)} px
                  <div className="mt-1 flex gap-1">
                    <SmallButton onClick={() => setCrop({ x: 0, y: 0, w: loaded.width, h: loaded.height })}>全体</SmallButton>
                    <SmallButton onClick={() => { const s = Math.min(loaded.width, loaded.height); setCrop({ x: (loaded.width - s) / 2, y: (loaded.height - s) / 2, w: s, h: s }); }}>中央の正方形</SmallButton>
                  </div>
                </div>
              )}
            </>
          )}
          {step === "Threshold" && (
            <>
              <h3 className="font-semibold">2. Threshold（二値化）</h3>
              <Toggle label="自動しきい値（Otsu）" checked={pre.threshold === "auto"} onChange={(v) => setPre({ ...pre, threshold: v ? "auto" : (preReply?.autoThreshold ?? 0.5) })} />
              {pre.threshold !== "auto" && <NumberField label="threshold" value={pre.threshold} onChange={(v) => setPre({ ...pre, threshold: v })} min={0} max={1} step={0.01} />}
              <Toggle label="adaptive（局所しきい値）" checked={pre.adaptive} onChange={(adaptive) => setPre({ ...pre, adaptive })} />
              <Toggle label="invert（インクと背景を反転）" checked={pre.invert} onChange={(invert) => setPre({ ...pre, invert })} />
              <NumberField label="contrast" value={pre.contrast} onChange={(contrast) => setPre({ ...pre, contrast })} min={0.5} max={3} step={0.1} />
              <NumberField label="blur (px)" value={pre.blur} onChange={(blur) => setPre({ ...pre, blur: Math.round(blur) })} min={0} max={6} step={1} />
              <NumberField label="denoise (px)" value={pre.denoise} onChange={(denoise) => setPre({ ...pre, denoise: Math.round(denoise) })} min={0} max={4} step={1} />
              {preReply && (
                <p className="text-[11px] text-ink-3">
                  背景: {preReply.backgroundLight ? "明るい（黒いインク）" : "暗い（白いインク）"} · Otsu {preReply.autoThreshold.toFixed(2)} · インク {Math.round((100 * preReply.inkPixels) / (preReply.width * preReply.height))}%
                </p>
              )}
            </>
          )}
          {step === "Center" && (
            <>
              <h3 className="font-semibold">3. Center Detection</h3>
              <p className="text-[11px] text-ink-3">自動推定（モーメント・外接矩形・180° 回転の自己相似）。プレビュー上でドラッグして修正できます。</p>
              <SmallButton onClick={() => void detectCenter()}>自動推定をやり直す</SmallButton>
              {centerCands.map((c) => (
                <button key={c.method} type="button" className="rounded border border-line-2 bg-paper px-2 py-1 text-left text-[11px] hover:border-select" onClick={() => setCenter(c.point)}>
                  {c.method}: ({c.point.x.toFixed(0)}, {c.point.y.toFixed(0)}) · score {c.score.toFixed(2)}
                </button>
              ))}
              {center && <p className="text-[11px]">現在: ({center.x.toFixed(1)}, {center.y.toFixed(1)}) px</p>}
            </>
          )}
          {step === "Symmetry" && (
            <>
              <h3 className="font-semibold">4. Symmetry Detection</h3>
              <p className="text-[11px] text-ink-3">score(n) = diff(image, rotate(360/n)) / diff(image, rotate(180/n))。小さいほど対称。</p>
              <SmallButton onClick={() => void detectSym()}>自動推定をやり直す</SmallButton>
              {symRes && (
                <div className="text-[11px]">
                  上位候補: {symRes.candidates.slice(0, 3).map((c) => `${c.n}-fold (${c.ratio.toFixed(2)})`).join(" · ")}
                  <br />
                  ミラー対称: {symRes.mirrorAxisDeg === null ? "なし" : `あり（軸 ${symRes.mirrorAxisDeg.toFixed(1)}°, score ${symRes.mirrorScore.toFixed(2)}）`}
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {SYMMETRY_CANDIDATES.map((n) => (
                  <SmallButton key={n} active={symmetry === n} onClick={() => setSymmetry(n)}>
                    {n}
                  </SmallButton>
                ))}
              </div>
              <NumberField label="任意の対称数" value={symmetry} onChange={(v) => setSymmetry(Math.max(1, Math.round(v)))} min={1} max={64} step={1} slider={false} />
              <Toggle label="mirror symmetry（半セクタ → ミラー）" checked={mirror} onChange={setMirror} />
              {symRes && symRes.bands.length > 0 && (
                <div className="text-[11px]">
                  <Toggle label="帯ごとの対称数を使う（リングごとに repeat を変える）" checked={perBand} onChange={setPerBand} />
                  <ul className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-ink-2">
                    {symRes.bands.map((bd, i) => (
                      <li key={i} className={bd.corr < 0.5 ? "text-ink-3" : ""}>
                        r {bd.rMin.toFixed(0)}–{bd.rMax.toFixed(0)} px: {bd.corr < 0.5 ? `${symmetry}（不確か）` : bd.n}-fold · {bd.corr.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <NumberField label="セクタ軸の角度（phase）" value={phase} onChange={setPhase} min={-180} max={180} step={0.5} unit="°" />
            </>
          )}
          {step === "Sector" && (
            <>
              <h3 className="font-semibold">5. Sector Preview</h3>
              <p className="text-[11px] text-ink-3">
                sectorAngle = 360 / {symmetry} = {(360 / symmetry).toFixed(1)}°。青い線がセクタ境界、橙の破線がミラー軸です。{mirror ? "半セクタだけを保存し、ミラー → セクタ → 回転複製で復元します。" : "1 セクタを保存し、回転複製で復元します。"}
              </p>
              <NumberField label="セクタ軸の角度（phase）" value={phase} onChange={setPhase} min={-180} max={180} step={0.5} unit="°" />
            </>
          )}
          {step === "Vectorize" && (
            <>
              <h3 className="font-semibold">6. Vectorize</h3>
              <p className="text-[11px] text-ink-3">marching squares で輪郭を抽出し、Douglas–Peucker と 3 次 Bézier フィットで滑らかにします。</p>
              <NumberField label="最小輪郭面積 (px²)" value={minAreaPx} onChange={(v) => setMinAreaPx(Math.round(v))} min={1} max={400} step={1} />
              <NumberField label="簡略化 (mm)" value={simplifyMm} onChange={setSimplifyMm} min={0.05} max={1} step={0.05} />
              <NumberField label="Bézier 許容誤差 (mm)" value={bezierErr} onChange={setBezierErr} min={0.05} max={1} step={0.05} />
              <SmallButton onClick={() => void runTrace()}>輪郭を再抽出</SmallButton>
              <Toggle label="線画なら自動で cells モード" checked={modeAuto} onChange={setModeAuto} />
              {contours && <p className="text-[11px]">輪郭 {contours.length} 本（穴 {contours.filter((c) => c.hole).length}）{mode === "cells" ? " · 線で囲まれたセル" : ""}</p>}
            </>
          )}
          {step === "Convert" && (
            <>
              <h3 className="font-semibold">7. Convert to Mandala</h3>
              <SelectField
                label="Import mode"
                value={mode}
                onChange={(m) => {
                  setModeAuto(false);
                  setMode(m);
                  void runTrace(m === "cells");
                }}
                options={[
                  { value: "trace", label: "A: Trace Only（忠実にベクタ化）" },
                  { value: "stencil", label: "B: Stencilize（塗り形状: 帯化・島検出・ブリッジ・小穴除去）" },
                  { value: "cells", label: "B′: Stencilize (cells)（線画: 線で囲まれた領域を抜き、線を材料に残す）" },
                ]}
              />
              {preReply && strokePx > 0 && (
                <p className="text-[10px] text-ink-3">
                  推定線幅 {(strokePx * (widthMm / preReply.width)).toFixed(2)} mm（{strokePx.toFixed(1)} px）{mode === "cells" ? " → 線画として扱います" : ""}
                </p>
              )}
              <NumberField label="画像の幅を何 mm にするか" value={widthMm} onChange={setWidthMm} min={20} max={600} step={1} unit="mm" />
              <Toggle label="プリミティブ認識（teardrop / leaf / circle / paisley…）" checked={recognize} onChange={setRecognize} />
              <Toggle label="リング検出（半径のクラスタリング）" checked={ringDetect} onChange={setRingDetect} />
              <SmallButton onClick={() => void runConvert()}>変換を実行</SmallButton>
              {result && (
                <div className="text-[11px]">
                  輪郭 {result.stats.contours} → セクタ内 {result.stats.sectorContours}（中心 {result.stats.centerContours}）→ リング {result.stats.rings}・要素 {result.stats.elements}・認識 {result.stats.recognized}・小片除去 {result.stats.droppedSmall}・細線の太らせ {result.stats.thickened}・非対称のため元位置で保持 {result.stats.unmatched}
                  {lowConf.length > 0 && <p className="mt-1 text-warn">⚠ 自信の低い要素 {lowConf.length} 個（Bézier として保持）</p>}
                  <ul className="mt-1 max-h-40 overflow-auto">
                    {result.elements.slice(0, 60).map((e) => (
                      <li key={e.id} className={e.confidence < 0.7 ? "text-warn" : "text-ink-2"}>
                        {e.detectedType} · {Math.round(e.confidence * 100)}% · {e.areaMm2} mm²
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {step === "Validate" && (
            <>
              <h3 className="font-semibold">8. Validate Stencil</h3>
              {validation ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  <span>書き出しパス</span><span className="text-right font-mono">{validation.subpaths}</span>
                  <span>島（残り）</span><span className={`text-right font-mono ${validation.islands ? "text-error" : ""}`}>{validation.islands}</span>
                  <span>ブリッジ</span><span className="text-right font-mono">{validation.bridges}</span>
                  <span>指摘</span><span className={`text-right font-mono ${validation.errors ? "text-error" : ""}`}>{validation.issues}（エラー {validation.errors}）</span>
                </div>
              ) : (
                <p className="text-[11px] text-ink-3">先に Convert を実行してください。</p>
              )}
              <p className="text-[11px] text-ink-3">インポート後は通常のプロジェクトとして編集できます。参照画像は半透明の Reference Layer として残り、インスペクタで不透明度・スケール・回転・位置・Difference View を変えられます。</p>
              <button type="button" className="rounded bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-2 disabled:opacity-40" disabled={!result} onClick={apply}>
                プロジェクトへ取り込む
              </button>
            </>
          )}
          <div className="mt-2 flex justify-between border-t border-line-2 pt-2">
            <SmallButton onClick={() => void goto(STEPS[Math.max(0, stepIndex - 1)]!)}>← 前へ</SmallButton>
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className="rounded bg-select px-3 py-1 text-[12px] text-white disabled:opacity-40" disabled={!loaded || !!busy} onClick={() => void goto(STEPS[stepIndex + 1]!)}>
                次へ →
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
