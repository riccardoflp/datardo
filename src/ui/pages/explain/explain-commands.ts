/**
 * **Run explain** from Go to and its key (`palette.run-command`): the explain of what the query bar or the pipeline
 * editor of the active collection tab holds (`explain.run`), shown in its Explain section, which is shown first.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf } from '../../query/collection-reads';
import { startFeature } from '../../shell/intent';
import { runExplain } from './explain-actions';

/** Whether a command is carried out here. */
export function isExplainCommand(id: string): boolean {
  return id === 'explain.run';
}

/** Runs **Run explain** on the active collection tab: its Explain section runs it once shown. */
export function runExplainCommand(state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (active === undefined || ref === undefined) {
    return;
  }
  if (active.section === 'explain') {
    void runExplain(ref);
    return;
  }
  const { connection, database, collection } = ref;
  startFeature('explain.show', { target: { kind: 'collection', connection, database, collection } });
}
