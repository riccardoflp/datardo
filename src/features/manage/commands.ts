/**
 * The commands of the manage area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { activeTabOf, tabConnectionOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('manage.create-database', text.commands.createDatabase),
  command('manage.create-collection', text.commands.createCollection),
  command('manage.rename-collection', text.commands.renameCollection),
  command('manage.drop-collection', text.commands.dropCollection),
  command('manage.drop-database', text.commands.dropDatabase),
  command('manage.definition', text.commands.definition),
  command('manage.edit-view', text.commands.editView),
  command('manage.validation', text.commands.validation),
  command('manage.edit-validation', text.commands.editValidation),
];

/** The connection of the active tab, or the current one, as saved. */
function connectionNow(state: AppState): ConnectionView | undefined {
  const active = activeTabOf(state.tabs);
  const id = (active === undefined ? undefined : tabConnectionOf(active)) ?? state.nav.current;
  return id === undefined ? undefined : savedConnection(state.connections, id);
}

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says, for Go to and its key: a
 * write on a connection that is not read-only, on the collection or the view of the active collection tab for those
 * that act on one, and **Save** of a section while that section is shown.
 */
export function isOffered(state: AppState, id: string): boolean {
  const connection = connectionNow(state);
  const writable = connection !== undefined && !connection.readOnly;
  const active = activeTabOf(state.tabs);
  const shows = active?.shows.kind === 'collection' ? active.shows : undefined;
  const view = shows?.view === true;
  switch (id) {
    case 'manage.create-database':
      return writable && connectionState(state.connections, connection.id) === 'connected';
    case 'manage.create-collection':
    case 'manage.drop-database':
      return writable;
    case 'manage.rename-collection':
      return writable && shows !== undefined && !view;
    case 'manage.drop-collection':
      return writable && shows !== undefined;
    case 'manage.definition':
      return shows !== undefined && view;
    case 'manage.validation':
      return shows !== undefined && !view;
    case 'manage.edit-view':
      return writable && shows !== undefined && view && active?.section === 'definition';
    case 'manage.edit-validation':
      return writable && shows !== undefined && !view && active?.section === 'validation';
    default:
      return false;
  }
}
