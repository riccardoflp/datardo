/**
 * Starts a command of the tab area from a control of the strip. The keys of the tab area's commands are read with
 * every other command's, in one place (`palette.key-press`).
 */
import { startFeature } from '../intent';

/** Starts a command: its feature, with its variant as the arguments. */
export function startCommand(command: string, place?: 'tab-strip'): void {
  const [feature = command, variant] = command.split(':');
  startFeature(feature, {
    ...(variant === undefined ? {} : { args: variant }),
    ...(place === undefined ? {} : { place }),
  });
}
