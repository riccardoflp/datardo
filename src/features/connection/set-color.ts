/**
 * Feature: connection.set-color — marks everything of a connection with one of eleven preset colors or a custom one,
 * for example red for production: its island, its group of tabs, its card and its line in the connection switcher.
 */
import type { ConnectionColor } from '../../shared/color';
import type { ConnectionView } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { colorLabel } from './color-presets';
import { chosenColor, colorQuestion, customColorQuestion } from './parts/color-question';
import { organizeText } from './text';
import { appStep, argumentsOf, nothingToDo, targetOrCurrent } from './types';

function question(connection: ConnectionView): Outcome {
  return colorQuestion({
    title: organizeText.colorTitle(connection.name),
    placeholder: organizeText.colorPlaceholder,
    current: connection.color ?? 'none',
  });
}

function planOf(connection: ConnectionView, color: ConnectionColor | undefined): Outcome {
  const title = organizeText.colorTitle(connection.name);
  if (connection.color === color) {
    return nothingToDo(title, organizeText.cannotUndoColor);
  }
  const text =
    color === undefined
      ? organizeText.removeColor(connection.name)
      : organizeText.setColor(connection.name, colorLabel(color).toLowerCase());
  return run({
    title,
    steps: [appStep('connection.set-color', { connection: connection.id, color: color ?? null }, text)],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoColor },
    publishes: false,
    after: [],
  });
}

/**
 * Feature: connection.set-color — asks the color, and for **Custom color…** the dialog **Choose a color**, then
 * `set the color of <name> to <color>` or `remove the color of <name>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  if (connection === undefined) {
    return nothingToDo('Set color', organizeText.cannotUndoColor);
  }
  const chosen = chosenColor(answers, argumentsOf(answers));
  switch (chosen?.kind) {
    case undefined:
    case 'follow':
      return question(connection);
    case 'custom':
      return customColorQuestion({ name: connection.name, start: connection.color ?? 'blue' });
    case 'none':
      return planOf(connection, undefined);
    case 'color':
      return planOf(connection, chosen.color);
  }
}
