/**
 * The commands of the chart area, each on the Commands line of its card (R2.3), and whether each is offered now.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { chartSection } from './show';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('chart.show', text.commands.show),
  command('chart.draw', text.commands.draw),
  command('chart.save-picture', text.commands.savePicture),
];

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says: **Chart** on a collection
 * tab, of a collection or of a view; **Draw** and **Save chart as picture…** while its Chart section is shown (the
 * window also asks for a chart drawn before it offers the picture).
 */
export function isOffered(state: AppState, id: string): boolean {
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'collection') {
    return false;
  }
  return id === 'chart.show' || active.section === chartSection;
}
