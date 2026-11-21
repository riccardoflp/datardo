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
import { commands as valueCommands } from './value/commands';

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
  ...valueCommands,
];
