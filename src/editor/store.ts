import { useSyncExternalStore } from "react";
import type { Project } from "../model/project";
import type { Command } from "./commands";

export type ViewMode = "design" | "stencil";

export interface ViewState {
  mode: ViewMode;
  grid: boolean;
  guides: boolean;
  rulers: boolean;
  showIssues: boolean;
  showBridges: boolean;
}

export interface Message {
  text: string;
  kind: "info" | "error" | "success";
  at: number;
}

export interface EditorState {
  project: Project;
  selectedRingId: string | null;
  hoverRingId: string | null;
  focusedIssueId: string | null;
  view: ViewState;
  message: Message | null;
  /** Increments on every project change (used for autosave). */
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface HistoryEntry {
  label: string;
  coalesceKey?: string;
  before: Project;
  time: number;
}

const COALESCE_MS = 900;
const HISTORY_LIMIT = 100;

type Listener = () => void;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private history: HistoryEntry[] = [];
  private future: { label: string; project: Project }[] = [];

  constructor(project: Project) {
    this.state = {
      project,
      selectedRingId: null,
      hoverRingId: null,
      focusedIssueId: null,
      view: { mode: "stencil", grid: true, guides: true, rulers: true, showIssues: true, showBridges: true },
      message: null,
      revision: 0,
      canUndo: false,
      canRedo: false,
    };
  }

  getState = (): EditorState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch, canUndo: this.history.length > 0, canRedo: this.future.length > 0 };
    for (const l of this.listeners) l();
  }

  /** Apply a command and record it for undo. */
  execute(cmd: Command): void {
    const before = this.state.project;
    const after = cmd.apply(before);
    if (after === before) return;
    const last = this.history[this.history.length - 1];
    const now = Date.now();
    if (!(cmd.coalesceKey && last && last.coalesceKey === cmd.coalesceKey && now - last.time < COALESCE_MS)) {
      this.history.push({ label: cmd.label, coalesceKey: cmd.coalesceKey, before, time: now });
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    } else {
      last.time = now;
    }
    this.future = [];
    const selected = this.state.selectedRingId && after.rings.some((r) => r.id === this.state.selectedRingId) ? this.state.selectedRingId : null;
    this.set({ project: after, revision: this.state.revision + 1, selectedRingId: selected });
  }

  undo(): void {
    const entry = this.history.pop();
    if (!entry) return;
    this.future.push({ label: entry.label, project: this.state.project });
    const selected = this.state.selectedRingId && entry.before.rings.some((r) => r.id === this.state.selectedRingId) ? this.state.selectedRingId : null;
    this.set({ project: entry.before, revision: this.state.revision + 1, selectedRingId: selected });
    this.notify(`元に戻す: ${entry.label}`);
  }

  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.history.push({ label: entry.label, before: this.state.project, time: 0 });
    const selected = this.state.selectedRingId && entry.project.rings.some((r) => r.id === this.state.selectedRingId) ? this.state.selectedRingId : null;
    this.set({ project: entry.project, revision: this.state.revision + 1, selectedRingId: selected });
    this.notify(`やり直し: ${entry.label}`);
  }

  /** Replace the project without recording history (initial load). */
  load(project: Project): void {
    this.history = [];
    this.future = [];
    this.set({ project, revision: this.state.revision + 1, selectedRingId: null, hoverRingId: null, focusedIssueId: null });
  }

  select(id: string | null): void {
    if (this.state.selectedRingId !== id) this.set({ selectedRingId: id, focusedIssueId: null });
  }

  hover(id: string | null): void {
    if (this.state.hoverRingId !== id) this.set({ hoverRingId: id });
  }

  focusIssue(id: string | null): void {
    this.set({ focusedIssueId: id });
  }

  setView(patch: Partial<ViewState>): void {
    this.set({ view: { ...this.state.view, ...patch } });
  }

  notify(text: string, kind: Message["kind"] = "info"): void {
    this.set({ message: { text, kind, at: Date.now() } });
  }
}

let current: EditorStore | null = null;

export function getStore(): EditorStore {
  if (!current) throw new Error("Editor store not initialised.");
  return current;
}

export function initStore(project: Project): EditorStore {
  current = new EditorStore(project);
  return current;
}

/** Subscribe to a slice of editor state. Selectors must return stable references or primitives. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
