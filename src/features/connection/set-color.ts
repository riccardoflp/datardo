/**
 * Feature: connection.set-color — marks everything of a connection with one of six colors, for example red for
 * production: its island, its group of tabs, its card and its line in the connection switcher.
 */
import type { ConnectionColor, ConnectionView } from '../../shared/connection';
import { connectionColors } from '../../shared/connection';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, run } from '../../shared/feature';
import { formViewText, organizeText } from './text';
import { appStep, argumentsOf, nothingToDo, targetOrCurrent } from './types';

const none = 'none';

function question(connection: ConnectionView): Outcome {
  const current = connection.color ?? none;
  const describe = (value: string): { description?: string } =>
    value === current ? { description: organizeText.current } : {};
  return ask({
    title: organizeText.colorTitle(connection.name),
    button: organizeText.pick,
    fields: [
      {
        kind: 'pick-one',
        key: 'color',
        label: organizeText.colorPlaceholder,
        default: current,
        choices: [
          ...connectionColors.map((color) => ({
            value: color,
            label: formViewText.colors[color],
            color,
            ...describe(color),
          })),
          { value: none, label: formViewText.noColor, ...describe(none) },
        ],
      },
    ],
  });
}

function chosenColor(answers: Answers): ConnectionColor | 'none' | undefined {
  const value = answers['color'] ?? argumentsOf(answers)['color'];
  if (value === none || value === null) {
    return none;
  }
  return connectionColors.find((color) => color === value);
}

/** Feature: connection.set-color — asks the color, then `set the color of <name> to <color>` or removes it. */
export function plan(context: Context, answers: Answers): Outcome {
  const connection = targetOrCurrent(context);
  if (connection === undefined) {
    return nothingToDo('Set color', organizeText.cannotUndoColor);
  }
  const color = chosenColor(answers);
  if (color === undefined) {
    return question(connection);
  }
  const title = organizeText.colorTitle(connection.name);
  if ((connection.color ?? none) === color) {
    return nothingToDo(title, organizeText.cannotUndoColor);
  }
  const text =
    color === none
      ? organizeText.removeColor(connection.name)
      : organizeText.setColor(connection.name, formViewText.colors[color].toLowerCase());
  return run({
    title,
    steps: [appStep('connection.set-color', { connection: connection.id, color: color === none ? null : color }, text)],
    danger: noDanger,
    undo: { cannot: organizeText.cannotUndoColor },
    publishes: false,
    after: [],
  });
}
