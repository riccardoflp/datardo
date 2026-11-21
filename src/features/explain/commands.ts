/**
 * The commands of the explain area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('explain.show', text.commands.show),
  command('explain.run', text.commands.run),
];

/** Whether a command of this area is offered now: on a collection tab, of a collection or of a view. */
export function isOffered(state: AppState): boolean {
  return activeTabOf(state.tabs)?.shows.kind === 'collection';
}
