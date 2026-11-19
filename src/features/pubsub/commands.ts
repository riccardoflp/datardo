/**
 * The commands of the Pub/Sub area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('pubsub.show', text.commands.show),
  command('pubsub.subscribe', text.commands.subscribe),
  command('pubsub.unsubscribe', text.commands.unsubscribe),
  command('pubsub.unsubscribe:all', text.commands.unsubscribeAll),
  command('pubsub.pause', text.commands.pause),
  command('pubsub.pause:resume', text.commands.resume),
  command('pubsub.clear', text.commands.clear),
  command('pubsub.copy:message', text.commands.copyMessage),
  command('pubsub.copy:channel', text.commands.copyChannel),
  command('pubsub.copy:json', text.commands.copyJson),
  command('pubsub.copy:command', text.commands.copyCommand),
  command('pubsub.export', text.commands.export),
  command('pubsub.publish', text.commands.publish),
  command('pubsub.follow-oplog', text.commands.follow),
];
