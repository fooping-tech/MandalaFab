import { useEffect, useState, type ReactNode } from "react";

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

/** Numeric input with optional slider. Commits each change (the store coalesces rapid edits). */
export function NumberField({ label, value, onChange, min, max, step = 1, unit, slider = true, title }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onChange(v);
    setText(String(v));
  };
  return (
    <label className="block" title={title}>
      <span className="mb-0.5 flex items-center justify-between text-[11px] text-ink-2">
        <span>{label}</span>
        {unit && <span className="text-ink-3">{unit}</span>}
      </span>
      <span className="flex items-center gap-2">
        {slider && min !== undefined && max !== undefined && (
          <input type="range" className="min-w-0 flex-1" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} />
        )}
        <input
          type="number"
          className="field-input w-[74px] shrink-0 text-right font-mono tabular-nums"
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "Escape") setText(String(value));
          }}
        />
      </span>
    </label>
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
