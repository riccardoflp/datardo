/**
 * Every command Datardo registers: Go to lists them and their keys start them. Each is on the Commands line of
 * exactly one card (R2.3), and is registered here by a call to `command()` of `./command.ts` with its identifier written whole.
 */
import { commands as windowCommands } from './window/commands';
import { commands as connectionCommands } from './connection/commands';
import { commands as navCommands } from './nav/commands';
import { commands as runnerCommands } from './runner/commands';
import { commands as settingsCommands } from './settings/commands';
import { commands as tabCommands } from './tab/commands';
import { areaCommands as paletteCommands } from './palette/commands';
import { commands as homeCommands } from './home/commands';
import { commands as treeCommands } from './tree/commands';
import { commands as undoCommands } from './undo/commands';
import { commands as queryCommands } from './query/commands';
import { commands as tableCommands } from './table/commands';
import { commands as keyCommands } from './key/commands';
import { areaCommands as aggregateCommands } from './aggregate/commands';
import { commands as playgroundCommands } from './playground/commands';
import { commands as documentCommands } from './document/commands';
import { commands as serverCommands } from './server/commands';
import { commands as valueCommands } from './value/commands';
import { commands as consoleCommands } from './console/commands';
import { commands as savedQueryCommands } from './saved-query/commands';
import { commands as manageCommands } from './manage/commands';
import { commands as fieldCommands } from './field/commands';
import { commands as indexCommands } from './index/commands';

import type { Command } from './command';

export type { Command, CommandId } from './command';

/** The commands of every area, in the order Go to lists them when nothing is typed. */
export const commands: readonly Command[] = [
  ...windowCommands,
  ...navCommands,
  ...connectionCommands,
  ...runnerCommands,
  ...settingsCommands,
  ...tabCommands,
  ...paletteCommands,
  ...homeCommands,
  ...treeCommands,
  ...undoCommands,
  ...queryCommands,
  ...tableCommands,
  ...keyCommands,
  ...aggregateCommands,
  ...playgroundCommands,
  ...documentCommands,
  ...serverCommands,
  ...valueCommands,
  ...consoleCommands,
  ...savedQueryCommands,
  ...manageCommands,
  ...fieldCommands,
  ...indexCommands,
];
