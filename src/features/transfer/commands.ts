/**
 * The commands of the transfer area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { copyText, exportText, generateText, importText } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('transfer.export', exportText.command),
  command('transfer.import', importText.command),
  command('transfer.copy-collection', copyText.command),
  command('transfer.generate', generateText.command),
];
