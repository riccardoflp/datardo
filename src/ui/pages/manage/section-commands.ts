/**
 * **Save view definition** and **Save validation rules** from Go to (`manage.edit-view`, `manage.edit-validation`):
 * the window saves the text of the section shown in the active tab, as **Save** in its toolbar does; nothing when the
 * text is as read.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { saveSection, type SectionKind, type SectionPlace } from './section-actions';
import { sectionOf } from './section-store';
import { isSectionReadOnly, sectionView } from './section-view';

/** The commands carried out here, by the section they save. */
const saves: Readonly<Record<string, SectionKind>> = {
  'manage.edit-view': 'definition',
  'manage.edit-validation': 'validation',
};

/** Whether a command is one of the saves of a section. */
export function isSectionCommand(id: string): boolean {
  return id in saves;
}

/** Saves the section of the active tab, when it is the one the command saves and its text changed. */
export function runSectionCommand(id: string, state: AppState): void {
  const kind = saves[id];
  const active = activeTabOf(state.tabs);
  if (kind === undefined || active?.shows.kind !== 'collection' || active.section !== kind) {
    return;
  }
  const place: SectionPlace = {
    tab: active.id,
    connection: active.shows.connection,
    database: active.shows.database,
    collection: active.shows.collection,
    view: active.shows.view === true,
  };
  const shown = sectionView(kind, place, isSectionReadOnly(state, place), sectionOf(active.id));
  if (shown.toolbar.save?.enabled === true && shown.editor !== undefined) {
    void saveSection(place, kind, shown.editor.text);
  }
}
