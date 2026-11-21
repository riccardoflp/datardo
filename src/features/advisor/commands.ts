/** The commands of the Index advisor, each on the Commands line of its card (R2.3), with the title Go to shows. */
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { advisorPage } from './show';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('advisor.show', text.commands.show),
  command('advisor.turn-on-profiler', text.commands.turnOnProfiler),
];

/**
 * Whether a command of the advisor is offered now. **Index advisor** opens the page of the current connection, which
 * the engine of the area already makes a MongoDB one. **Turn on the profiler** acts on the database of the active
 * Index advisor tab, on a connection that is not read-only (`advisor.turn-on-profiler`, "Offered when").
 */
export function isOffered(state: AppState, id: string): boolean {
  if (id === 'advisor.show') {
    return state.nav.current !== undefined;
  }
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'page' || active.shows.page !== advisorPage || active.shows.database === undefined) {
    return false;
  }
  return savedConnection(state.connections, active.shows.connection)?.readOnly === false;
}
