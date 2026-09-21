import { useSyncExternalStore } from "react";
import type { Project } from "../model/project";
import type { Command } from "./commands";

export type ViewMode = "design" | "material" | "cutout" | "preview";
export type DiffMode = "off" | "reference" | "generated" | "overlap";

/** Reference image overlay (session state, not part of the project JSON). */
export interface ReferenceLayer {
  /** Object URL or data URL of the (cropped) image. */
  url: string;
  /** Image pixel size. */
  pxWidth: number;
  pxHeight: number;
  /** Displayed width in mm (height follows the aspect ratio). */
  widthMm: number;
  /** Position of the image center in design coordinates (mm). */
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface ViewState {
  mode: ViewMode;
  grid: boolean;
  guides: boolean;
  rulers: boolean;
  showIssues: boolean;
  showBridges: boolean;
  /** Show the sector wedge and mirror axis of the selected ring. */
  sectorGuide: boolean;
  /** Difference view between the reference image and the generated geometry. */
  diff: DiffMode;
}

export interface SelectedItem {
  ringId: string;
  elementId: string;
}
export type Selection = { kind: "project" } | { kind: "center" } | { kind: "ring"; ringId: string } | { kind: "element"; ringId: string; elementId: string } | { kind: "multi"; items: SelectedItem[] };

/** Elements covered by a selection (one for "element", several for "multi", none otherwise). */
export function selectedItems(sel: Selection): SelectedItem[] {
  if (sel.kind === "element") return [{ ringId: sel.ringId, elementId: sel.elementId }];
  if (sel.kind === "multi") return sel.items;
  return [];
}

/** 0 items → project, 1 → element, more → multi (duplicates removed, order kept). */
export function selectionOf(items: readonly SelectedItem[]): Selection {
  const seen = new Set<string>();
  const list = items.filter((i) => (seen.has(i.elementId) ? false : (seen.add(i.elementId), true)));
  if (list.length === 0) return { kind: "project" };
  if (list.length === 1) return { kind: "element", ringId: list[0]!.ringId, elementId: list[0]!.elementId };
  return { kind: "multi", items: list };
}

export interface Message {
  text: string;
  kind: "info" | "error" | "success";
  at: number;
}

export interface EditorState {
  project: Project;
  selection: Selection;
  hoverElementId: string | null;
  hoverRingId: string | null;
  focusedIssueId: string | null;
  view: ViewState;
  reference: ReferenceLayer | null;
  message: Message | null;
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

function hasElement(project: Project, ringId: string, elementId: string): boolean {
  const ring = project.rings.find((r) => r.id === ringId);
  if (!ring) return false;
  const has = (list: readonly Project["rings"][number]["elements"][number][]): boolean => list.some((e) => e.id === elementId || (e.children ? has(e.children) : false));
  return has(ring.elements);
}

function validSelection(sel: Selection, project: Project): Selection {
  if (sel.kind === "ring" && !project.rings.some((r) => r.id === sel.ringId)) return { kind: "project" };
  if (sel.kind === "element") {
    if (!project.rings.some((r) => r.id === sel.ringId)) return { kind: "project" };
    if (!hasElement(project, sel.ringId, sel.elementId)) return { kind: "ring", ringId: sel.ringId };
  }
  if (sel.kind === "multi") return selectionOf(sel.items.filter((i) => hasElement(project, i.ringId, i.elementId)));
  return sel;
}

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private history: HistoryEntry[] = [];
  private future: { label: string; project: Project }[] = [];

  constructor(project: Project) {
    this.state = {
      project,
      selection: { kind: "project" },
      hoverElementId: null,
      hoverRingId: null,
      focusedIssueId: null,
      view: { mode: "material", grid: true, guides: true, rulers: true, showIssues: true, showBridges: true, sectorGuide: true, diff: "off" },
      reference: null,
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

  private setProject(project: Project): void {
    this.set({ project, revision: this.state.revision + 1, selection: validSelection(this.state.selection, project) });
  }

  execute(cmd: Command): void {
    const before = this.state.project;
    const after = cmd.apply(before);
    if (after === before) return;
    const last = this.history[this.history.length - 1];
    const now = Date.now();
    if (!(cmd.coalesceKey && last && last.coalesceKey === cmd.coalesceKey && now - last.time < COALESCE_MS)) {
      this.history.push({ label: cmd.label, coalesceKey: cmd.coalesceKey, before, time: now });
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    } else last.time = now;
    this.future = [];
    this.setProject(after);
  }

  undo(): void {
    const entry = this.history.pop();
    if (!entry) return;
    this.future.push({ label: entry.label, project: this.state.project });
    this.setProject(entry.before);
    this.notify(`元に戻す: ${entry.label}`);
  }

  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.history.push({ label: entry.label, before: this.state.project, time: 0 });
    this.setProject(entry.project);
    this.notify(`やり直し: ${entry.label}`);
  }

  load(project: Project): void {
    this.history = [];
    this.future = [];
    this.set({ project, revision: this.state.revision + 1, selection: { kind: "project" }, hoverElementId: null, hoverRingId: null, focusedIssueId: null });
  }

  select(sel: Selection): void {
    this.set({ selection: validSelection(sel, this.state.project), focusedIssueId: null });
  }

  /** Select a set of elements (0 → project, 1 → element, more → multi). */
  selectMany(items: readonly SelectedItem[]): void {
    this.select(selectionOf(items));
  }

  /** Shift-click: add the element to the selection, or remove it when already selected. */
  toggleSelect(ringId: string, elementId: string): void {
    const items = selectedItems(this.state.selection);
    const next = items.some((i) => i.elementId === elementId) ? items.filter((i) => i.elementId !== elementId) : [...items, { ringId, elementId }];
    this.select(selectionOf(next));
  }

  hover(ringId: string | null, elementId: string | null = null): void {
    if (this.state.hoverRingId !== ringId || this.state.hoverElementId !== elementId) this.set({ hoverRingId: ringId, hoverElementId: elementId });
  }

  focusIssue(id: string | null): void {
    this.set({ focusedIssueId: id });
  }

  setView(patch: Partial<ViewState>): void {
    this.set({ view: { ...this.state.view, ...patch } });
  }

  private lastNonPreview: ViewMode = "material";

  /** Toggle the manufacturing preview (cut lines only, exactly what the SVG export contains). */
  togglePreview(): void {
    const v = this.state.view;
    if (v.mode === "preview") this.setView({ mode: this.lastNonPreview });
    else {
      this.lastNonPreview = v.mode;
      this.setView({ mode: "preview" });
    }
  }

  setReference(ref: ReferenceLayer | null): void {
    if (this.state.reference && (!ref || ref.url !== this.state.reference.url) && this.state.reference.url.startsWith("blob:")) URL.revokeObjectURL(this.state.reference.url);
    this.set({ reference: ref, view: ref ? this.state.view : { ...this.state.view, diff: "off" } });
  }

  updateReference(patch: Partial<ReferenceLayer>): void {
    if (!this.state.reference) return;
    this.set({ reference: { ...this.state.reference, ...patch } });
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
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

/** Convenience selectors. */
export const selectedRingId = (s: EditorState): string | null => (s.selection.kind === "ring" || s.selection.kind === "element" ? s.selection.ringId : null);
export const selectedElementId = (s: EditorState): string | null => (s.selection.kind === "element" ? s.selection.elementId : null);
