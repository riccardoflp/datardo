/**
 * Feature: undo.per-connection — turns the undo history off for one connection, for example one whose bulk writes are
 * too large to keep, and back on.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { connectionText } from './text';
import { appStep, nothingToDo } from './types';

/** The two variants: **Stop keeping undo history** and **Keep undo history**. */
export type KeepVariant = 'stop' | 'keep';

const variants: readonly KeepVariant[] = ['stop', 'keep'];

/** The variant the feature was started with: the variant of its command, or `args.variant`. */
export function variantOf(answers: Answers): KeepVariant | undefined {
  const args = answers['args'];
  const value = typeof args === 'object' && args !== null ? (args as { readonly variant?: unknown }).variant : args;
  return variants.find((each) => each === value);
}

/** Whether a variant is offered on a connection: **Stop…** on one that keeps it, **Keep…** on one that doesn't. */
export function isVariantOffered(connection: ConnectionView, variant: KeepVariant): boolean {
  return !connection.readOnly && connection.keepsUndo === (variant === 'stop');
}

/** The title of a variant, as the menus and Go to show it. */
export function variantTitle(variant: KeepVariant): string {
  return variant === 'stop' ? connectionText.stop : connectionText.keep;
}

/** The line of the connection's tooltip when it does not keep its undo history; none when it does. */
export function connectionTooltip(connection: ConnectionView): string | undefined {
  return connection.keepsUndo ? undefined : connectionText.notKept;
}

/** Feature: undo.per-connection — `save the connection <name>`, with its undo history off or on. */
export function plan(context: Context, answers: Answers): Outcome {
  const variant = variantOf(answers) ?? 'stop';
  const id = targetConnection(context.target);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  if (connection === undefined) {
    return nothingToDo(variantTitle(variant), connectionText.cannotUndo);
  }
  if (connection.readOnly) {
    return refuse('undo.per-connection/read-only', connectionText.readOnly(connection.name));
  }
  const keepsUndo = variant === 'keep';
  if (connection.keepsUndo === keepsUndo) {
    return nothingToDo(variantTitle(variant), connectionText.cannotUndo);
  }
  return run({
    title: variantTitle(variant),
    steps: [
      appStep(
        'connection.set-keeps-undo',
        { connection: connection.id, keepsUndo },
        connectionText.saveConnection(connection.name),
      ),
    ],
    danger: noDanger,
    undo: { cannot: connectionText.cannotUndo },
    publishes: false,
    after: [],
  });
}
