import type { Project } from "../model/project";
import { normalizeProject } from "../model/validate";

const KEY = "mandalafab-v1";

export function loadLocal(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

let timer: number | null = null;
export function saveLocal(project: Project): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
    } catch {
      /* quota or private mode: ignore */
    }
  }, 300);
}

export function saveFile(name: string, data: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Chrome may read the object URL after the save dialog closes; revoke late.
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return s.length > 0 ? s : "mandala";
}
