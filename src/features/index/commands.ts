/**
 * The commands of the index area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { indexSection } from './show';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('index.show', text.commands.show),
  command('index.create', text.commands.create),
  command('index.edit', text.commands.edit),
  command('index.hide', text.commands.hide),
  command('index.drop', text.commands.drop),
  command('index.create-search', text.commands.createSearch),
  command('index.edit-search', text.commands.editSearch),
  command('index.drop-search', text.commands.dropSearch),
];

/** The commands that act on the index selected in the Indexes section: the window starts them on its row. */
const onSelectedRow: ReadonlySet<string> = new Set([
  'index.edit',
  'index.hide',
  'index.drop',
  'index.edit-search',
  'index.drop-search',
]);

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says, for Go to and its key: on
 * the collection of the active tab, never a view's; the writes on a connection that is not read-only; those of a row
 * while the Indexes section is shown.
 */
export function isOffered(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
  const shows = active?.shows.kind === 'collection' && active.shows.view !== true ? active.shows : undefined;
  if (shows === undefined) {
    return false;
  }
  const writable = savedConnection(state.connections, shows.connection)?.readOnly === false;
  if (id === 'index.show') {
    return true;
  }
  if (onSelectedRow.has(id)) {
    return writable && active?.section === indexSection;
  }
  return writable && (id === 'index.create' || id === 'index.create-search');
}
