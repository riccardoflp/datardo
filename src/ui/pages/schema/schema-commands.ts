/**
 * **Analyze schema** from Go to and its key (`palette.run-command`): the sample of the active collection tab is read
 * again with the filter of its query bar as typed, as **Analyze** does (`schema.sample`).
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf } from '../../query/collection-reads';
import { analyze } from './schema-actions';

/** Whether a command is carried out here. */
export function isSchemaCommand(id: string): boolean {
  return id === 'schema.sample';
}

/** Runs **Analyze schema** on the active collection tab. */
export function runSchemaCommand(state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref !== undefined) {
    void analyze(ref);
  }
}
