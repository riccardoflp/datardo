/**
 * The commands of the column actions, each on the Commands line of its card (R2.3), with the title Go to shows. Each
 * acts on the column of the selected cell.
 */
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('field.rename', text.commands.rename),
  command('field.remove', text.commands.remove),
  command('field.convert-type', text.commands.convert),
];

/**
 * Whether a command of this area is offered now (field.md, *Where*): the active tab is of a collection that can be
 * changed, not a view, of a connection that is not read-only. The window then acts on the column of the selected cell.
 */
export function isOffered(state: AppState): boolean {
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'collection' || active.shows.view === true) {
    return false;
  }
  const connection = savedConnection(state.connections, active.shows.connection);
  return connection !== undefined && !connection.readOnly;
}
