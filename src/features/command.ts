/**
 * What a command is, and how one is declared: each area declares its own in `src/features/<area>/commands.ts`, and
 * `src/features/commands.ts` gathers them.
 */

/** The identifier of a command: its card's, or `area.action:variant`. */
export type CommandId = string & { readonly __brand: 'CommandId' };

/** A command as Go to shows it. */
export interface Command {
  readonly id: CommandId;
  readonly title: string;
  /** The key that starts it, as the cards write it (`Ctrl+K`); `Ctrl` is `Cmd` on macOS. */
  readonly key?: string;
}

/** Declares a command. The identifier is written whole at each call, so that the checks and a search find it. */
export function command(id: string, title: string, key?: string): Command {
  return key === undefined ? { id: id as CommandId, title } : { id: id as CommandId, title, key };
}
