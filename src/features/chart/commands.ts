/**
 * The commands of the chart area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('chart.show', text.commands.show),
  command('chart.draw', text.commands.draw),
  command('chart.save-picture', text.commands.savePicture),
];
