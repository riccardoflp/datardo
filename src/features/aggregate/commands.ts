/**
 * The commands of the aggregate area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. Those that act on a stage act on the stage whose body has the focus.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the aggregate area. */
export const areaCommands: readonly Command[] = [
  command('aggregate.add-stage', text.commands.addStage),
  command('aggregate.move-stage:left', text.commands.moveLeft),
  command('aggregate.move-stage:right', text.commands.moveRight),
  command('aggregate.clear', text.commands.clear),
  command('aggregate.edit-as-text:text', text.commands.editAsText),
  command('aggregate.edit-as-text:stages', text.commands.editAsStages),
  command('aggregate.copy', text.commands.copy),
  command('aggregate.run', text.commands.run),
  command('aggregate.save-as-view', text.commands.saveAsView),
];
