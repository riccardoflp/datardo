/**
 * The commands of the schema area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { schemaSection } from './show';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('schema.show', text.commands.show),
  command('schema.sample', text.commands.sample),
];

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says: **Schema** on a collection
 * tab, of a collection or of a view; **Analyze schema** while its Schema section is shown.
 */
export function isOffered(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'collection') {
    return false;
  }
  return id === 'schema.show' || (id === 'schema.sample' && active.section === schemaSection);
}
