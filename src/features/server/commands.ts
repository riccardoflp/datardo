/**
 * The commands of the Server area, each on the Commands line of its card (R2.3), with the title Go to shows.
 * `server.slow-log` and `server.show:slow-log` both open the page on its Slow log section, as their cards say; both
 * cards title it **Server: Slow log**, and Go to lists no two commands with one title, so `server.slow-log` is titled
 * **Slow log** (Q73).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('server.show', text.commands.show),
  command('server.show:overview', text.commands.section(text.sections.overview)),
  command('server.show:clients', text.commands.section(text.sections.clients)),
  command('server.show:slow-log', text.commands.section(text.sections['slow-log'])),
  command('server.show:memory', text.commands.section(text.sections.memory)),
  command('server.show:replication', text.commands.section(text.sections.replication)),
  command('server.show:configuration', text.commands.section(text.sections.configuration)),
  command('server.slow-log', text.sections['slow-log']),
  command('server.slow-log-reset', text.commands.slowLogReset),
  command('server.largest-keys', text.commands.largestKeys),
];
