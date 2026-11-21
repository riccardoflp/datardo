/**
 * What a Definition or Validation section shows now, from what the window keeps of it and the connection as it is
 * now (`manage.definition`, `manage.validation`): the same for the section drawn and for **Save** started from Go to.
 */
import { view as definitionView, type SectionView } from '../../../features/manage/definition';
import { view as validationView, type ValidationView } from '../../../features/manage/validation';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import type { SectionKind, SectionPlace } from './section-actions';
import type { SectionMemory } from './section-store';

/** Whether the connection of a section is read-only, as it is now. */
export function isSectionReadOnly(state: AppState, place: SectionPlace): boolean {
  return savedConnection(state.connections, place.connection)?.readOnly ?? false;
}

/** What the section shows; for Validation, also whether the sample is to be read now. */
export function sectionView(
  kind: SectionKind,
  place: SectionPlace,
  readOnly: boolean,
  memory: SectionMemory,
): SectionView & Partial<Pick<ValidationView, 'readSample'>> {
  const kept = {
    ...(memory.typed === undefined ? {} : { typed: memory.typed }),
    ...(memory.refused === undefined ? {} : { refused: memory.refused }),
  };
  if (kind === 'definition') {
    return definitionView({ database: place.database, view: place.collection, readOnly, read: memory.read, ...kept });
  }
  return validationView({
    database: place.database,
    collection: place.collection,
    readOnly,
    read: memory.read,
    ...(memory.sample === undefined ? {} : { sample: memory.sample }),
    ...kept,
  });
}
