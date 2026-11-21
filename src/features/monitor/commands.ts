/**
 * The commands of the Monitor page, each on the Commands line of its card (R2.3), with the title Go to shows:
 * **Monitor**, and **Monitor: Operations**, **Monitor: Slow queries**, … for each section.
 */
import type { AppState } from '../../shared/state';
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('monitor.show', text.commands.show),
  command('monitor.show:operations', text.commands.section(text.sections.operations)),
  command('monitor.show:slow-queries', text.commands.section(text.sections['slow-queries'])),
  command('monitor.show:stats', text.commands.section(text.sections.stats)),
  command('monitor.show:replication', text.commands.section(text.sections.replication)),
  command('monitor.show:sharding', text.commands.section(text.sections.sharding)),
];

/** The commands of the sections that are built: those of the Stats, Replication and Sharding sections wait for M31. */
const builtCommands: ReadonlySet<string> = new Set([
  'monitor.show',
  'monitor.show:operations',
  'monitor.show:slow-queries',
]);

/**
 * Whether a command of the page is offered now: the page of the current connection, which the engine of the area
 * already makes a MongoDB one (`monitor.show`, "Offered when"), for a section that is built.
 */
export function isOffered(state: AppState, id: string): boolean {
  return builtCommands.has(id) && state.nav.current !== undefined;
}
