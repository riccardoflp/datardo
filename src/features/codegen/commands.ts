/**
 * The commands of the codegen area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { codeSection } from './show';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('codegen.show', text.commands.show),
  command('codegen.copy', text.commands.copy),
];

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says: **Code** on a collection
 * tab, of a collection or of a view; **Copy code** while its Code section is shown (the window also asks for code
 * shown, not *Invalid query:*, before it offers it).
 */
export function isOffered(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'collection') {
    return false;
  }
  return id === 'codegen.show' || active.section === codeSection;
}
