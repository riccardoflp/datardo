/**
 * What the window keeps of each document tab (`document.open`): the document as read, the text of the editor, the
 * document as loaded (to compare it when saving), the error of the last save, and whether **Revert** asks first. It
 * lasts as long as the window; the text survives a crash as the tab's draft (`tab.restore`).
 */
import { useSyncExternalStore } from 'react';
import type { DocumentLoad } from '../../../features/document/open';
import type { TabId } from '../../../shared/ids';

/** One document tab. */
export interface TabDocument {
  readonly load: DocumentLoad;
  /** The text of the editor. */
  readonly text: string;
  /** The text as it was loaded, or as the new document's tab opened. */
  readonly loadedText: string;
  /** The document as loaded, as canonical Extended JSON. */
  readonly original?: string;
  /** The error of the last save or insert, shown in the tab; the text stays. */
  readonly problem?: string;
  /** **Discard your changes…?** is open. */
  readonly confirmRevert: boolean;
}

const documents = new Map<TabId, TabDocument>();
const listeners = new Set<() => void>();

const unread: TabDocument = { load: { kind: 'loading' }, text: '', loadedText: '', confirmRevert: false };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the window has of a document tab; `undefined` before it was first read. */
export function tabDocumentOf(tab: TabId): TabDocument | undefined {
  return documents.get(tab);
}

/** Changes what the window has of a document tab. */
export function changeTabDocument(tab: TabId, change: (before: TabDocument) => TabDocument): void {
  documents.set(tab, change(documents.get(tab) ?? unread));
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets a tab that was closed or became another. */
export function forgetTabDocument(tab: TabId): void {
  documents.delete(tab);
}

/** What the window has of a document tab, drawn again when it changes. */
export function useTabDocument(tab: TabId): TabDocument | undefined {
  return useSyncExternalStore(subscribe, () => documents.get(tab));
}
