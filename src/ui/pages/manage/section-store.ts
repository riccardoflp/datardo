/**
 * What the window keeps of the Definition section of a view's tab and of the Validation section of a collection's tab
 * (`manage.definition`, `manage.validation`): the options read, the text typed and not saved, the save refused last,
 * the sample of a collection without rules, and whether **Reload** asks first. It lasts as long as the window, so the
 * text typed stays while another section is shown.
 */
import { useSyncExternalStore } from 'react';
import type { OptionsRead, RefusedSave } from '../../../features/manage/definition';
import type { SampleRead } from '../../../features/manage/validation';
import type { TabId } from '../../../shared/ids';

/** One section of one tab. */
export interface SectionMemory {
  readonly read: OptionsRead;
  /** Whether the options were asked for since the tab opened. */
  readonly asked: boolean;
  readonly typed?: string;
  readonly refused?: RefusedSave;
  readonly sample?: SampleRead;
  /** **Discard your changes…?** is open, after **Reload**. */
  readonly confirmReload: boolean;
}

const sections = new Map<TabId, SectionMemory>();
const listeners = new Set<() => void>();

/** Nothing read yet. */
export const unreadSection: SectionMemory = { read: { kind: 'loading' }, asked: false, confirmReload: false };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the window keeps of the section of a tab. */
export function sectionOf(tab: TabId): SectionMemory {
  return sections.get(tab) ?? unreadSection;
}

/** Changes what the window keeps of the section of a tab. */
export function changeSection(tab: TabId, change: (before: SectionMemory) => SectionMemory): void {
  sections.set(tab, change(sectionOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** What the window keeps of the section of a tab, drawn again when it changes. */
export function useSection(tab: TabId): SectionMemory {
  return useSyncExternalStore(subscribe, () => sectionOf(tab));
}
