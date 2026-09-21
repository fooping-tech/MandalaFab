import { useEffect, useRef, useState, type ReactNode } from "react";
import type React from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  slider?: boolean;
  title?: string;
}

/**
 * Numeric input made for touch as well as the keyboard:
 *  - a visible slider bar (when min / max are given) that can be dragged,
 *  - ▼ / ▲ stepper buttons (hold to repeat, Shift = 10 steps),
 *  - dragging sideways on the grip left of the number nudges the value,
 *  - the number itself can still be typed.
 * Commits each change (the store coalesces rapid edits).
 */
export function NumberField({ label, value, onChange, min, max, step = 1, unit, slider = true, title }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const decimals = Math.max(0, Math.min(4, (String(step).split(".")[1] ?? "").length));
  const clamp = (n: number): number => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return Number(v.toFixed(decimals));
  };
  const commit = (raw: string): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const v = clamp(n);
    if (v !== value) onChange(v);
    setText(String(v));
  };
  const nudge = (dir: number, big: boolean): void => {
    const v = clamp(value + dir * step * (big ? 10 : 1));
    if (v !== value) onChange(v);
  };
  // Hold-to-repeat for the stepper buttons.
  const repeat = useRef<{ t: number; i: number } | null>(null);
  const stopRepeat = (): void => {
    if (!repeat.current) return;
    window.clearTimeout(repeat.current.t);
    window.clearInterval(repeat.current.i);
    repeat.current = null;
  };
  const startRepeat = (dir: number, big: boolean): void => {
    stopRepeat();
    nudge(dir, big);
    const t = window.setTimeout(() => {
      const i = window.setInterval(() => nudge(dir, big), 60);
      repeat.current = { t, i };
    }, 400);
    repeat.current = { t, i: 0 };
  };
  useEffect(() => stopRepeat, []);
  // Drag on the grip: 1 step per 6 px (Shift: 10 steps).
  const dragRef = useRef<{ x: number; base: number; acc: number } | null>(null);
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    dragRef.current = { x: e.clientX, base: value, acc: 0 };
  };
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    const steps = Math.trunc((e.clientX - d.x) / 6) * (e.shiftKey ? 10 : 1);
    const v = clamp(d.base + steps * step);
    if (v !== value) onChange(v);
  };
  const onGripUp = (): void => {
    dragRef.current = null;
  };
  const hasSlider = slider && min !== undefined && max !== undefined;
  const pct = hasSlider ? Math.max(0, Math.min(100, ((value - min!) / Math.max(1e-9, max! - min!)) * 100)) : 0;
  return (
    <div className="block" title={title}>
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-ink-2">
        <span>{label}</span>
        {unit && <span className="text-ink-3">{unit}</span>}
      </span>
      {hasSlider && (
        <input
          type="range"
          className="num-slider block w-full"
          style={{ "--pct": `${pct}%` } as React.CSSProperties}
          min={min}
          max={max}
          step={step}
          value={Math.min(max!, Math.max(min!, value))}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      )}
      <span className="num-field flex items-stretch">
        <button type="button" className="num-grip" title="左右にドラッグで数値を変更（Shift で 10 倍）" aria-label="ドラッグで変更" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
          ⋮⋮
        </button>
        <button
          type="button"
          className="num-step"
          aria-label="減らす"
          onPointerDown={(e) => {
            e.preventDefault();
            startRepeat(-1, e.shiftKey);
          }}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          onContextMenu={(e) => e.preventDefault()}
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          className="num-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            else if (e.key === "Escape") setText(String(value));
            else if (e.key === "ArrowUp") {
              e.preventDefault();
              nudge(1, e.shiftKey);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              nudge(-1, e.shiftKey);
            }
          }}
          aria-label={label}
        />
        <button
          type="button"
          className="num-step"
          aria-label="増やす"
          onPointerDown={(e) => {
            e.preventDefault();
            startRepeat(1, e.shiftKey);
          }}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          onContextMenu={(e) => e.preventDefault()}
        >
          ＋
        </button>
      </span>
    </div>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, title }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; title?: string }) {
  return (
    <label className="block" title={title}>
      <span className="mb-0.5 block text-[11px] text-ink-2">{label}</span>
      <select className="field-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-ink-2">{label}</span>
      <input className="field-input" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onChange(text)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

export function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px]" title={title}>
      <span>{label}</span>
      <input type="checkbox" className="accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line-2 px-4 py-3">
      <h3 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-2">
        <span>{title}</span>
        {right}
      </h3>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

export function SmallButton({ children, onClick, active, danger, title }: { children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[11px] ${active ? "border-select bg-select-bg text-select" : danger ? "border-line text-error hover:border-error" : "border-line bg-paper text-ink-2 hover:border-select hover:text-select"}`}
    >
      {children}
    </button>
  );
}
