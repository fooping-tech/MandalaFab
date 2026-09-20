/**
 * Browser-persisted user parts library. Tiny external store (useSyncExternalStore)
 * separate from the project store: parts are not part of the project JSON.
 */
import { useSyncExternalStore } from "react";
import { LIBRARY_LIMIT, normalizeLibraryItem, type LibraryItem } from "../model/library";

const KEY = "mandalafab-parts-v1";
let items: readonly LibraryItem[] | null = null;
const listeners = new Set<() => void>();

function load(): readonly LibraryItem[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map(normalizeLibraryItem).filter((x): x is LibraryItem => x !== null);
  } catch {
    return [];
  }
}

export function getLibrary(): readonly LibraryItem[] {
  if (!items) items = load();
  return items;
}

/** Replace the library. Returns false when the browser refused to persist (quota, private mode). */
export function setLibrary(next: readonly LibraryItem[]): boolean {
  items = next.slice(0, LIBRARY_LIMIT);
  for (const l of listeners) l();
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

/** Prepend items (newest first). An id already in the library gets a fresh suffix instead of replacing. */
export function addLibraryItems(added: readonly LibraryItem[]): boolean {
  const current = getLibrary();
  const ids = new Set(current.map((i) => i.id));
  const merged = [...added.map((i) => (ids.has(i.id) ? { ...i, id: `${i.id}-${Date.now().toString(36)}` } : i)), ...current];
  return setLibrary(merged);
}

export function removeLibraryItem(id: string): boolean {
  return setLibrary(getLibrary().filter((i) => i.id !== id));
}

export function renameLibraryItem(id: string, name: string): boolean {
  const n = name.trim().slice(0, 60);
  if (!n) return false;
  return setLibrary(getLibrary().map((i) => (i.id === id ? { ...i, name: n } : i)));
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLibrary(): readonly LibraryItem[] {
  return useSyncExternalStore(subscribe, getLibrary, getLibrary);
}

/** Test helper: forget the cached list so the next read re-loads from storage. */
export function resetLibraryCache(): void {
  items = null;
}
