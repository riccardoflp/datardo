/**
 * The list of colors that `connection.set-color`, `tree.set-database-color` and `tree.set-collection-color` ask
 * (`runner.ask`), and the dialog **Choose a color** that its **Custom color…** opens (`connection.custom-color`): the
 * eleven presets, **None**, for a collection what it follows, and **Custom color…**; then how the answer is read.
 */
import { colorOfText, isHexColor, presetColors, type ConnectionColor, type OwnColor } from '../../../shared/color';
import type { Json } from '../../../shared/engine-request';
import { ask, type Answers, type Outcome } from '../../../shared/feature';
import type { Choice } from '../../../shared/question';
import { jsonFields } from '../types';
import { colorText, customColorText, presetLabels } from './color-text';

/** The value of the item that follows what is above: **Connection's color** or **Database's color**. */
export const followValue = 'follow';

/** The value of **Custom color…**. */
export const customValue = 'custom';

/** The value of **None**. */
export const noneValue = 'none';

/** What the list is asked about. */
export interface ColorList {
  readonly title: string;
  readonly placeholder: string;
  /** The current choice: an own color, **None**, or what is above it (`follow`). */
  readonly current: OwnColor | typeof followValue;
  /** The description of **None**, when it has one. */
  readonly noneDescription?: string;
  /** For a collection: the item that follows, with its label and the color it describes. */
  readonly follow?: { readonly label: string; readonly color: string };
}

/** What the user chose: a color, **None**, what is above, or **Custom color…** before its dialog answered. */
export type ColorChoice =
  | { readonly kind: 'color'; readonly color: ConnectionColor }
  | { readonly kind: 'none' }
  | { readonly kind: 'follow' }
  | { readonly kind: 'custom' };

function described(description: string | undefined, current: boolean): { readonly description?: string } {
  if (!current) {
    return description === undefined ? {} : { description };
  }
  return { description: description === undefined ? colorText.current : colorText.andCurrent(description) };
}

/** The items of the list, in their order. */
export function colorChoices(list: ColorList): readonly Choice[] {
  const custom = isHexColor(list.current) ? list.current : undefined;
  return [
    ...presetColors.map((color) => ({
      value: color,
      label: presetLabels[color],
      color,
      ...described(undefined, list.current === color),
    })),
    { value: noneValue, label: colorText.none, ...described(list.noneDescription, list.current === noneValue) },
    ...(list.follow === undefined
      ? []
      : [{ value: followValue, label: list.follow.label, ...described(list.follow.color, list.current === 'follow') }]),
    {
      value: customValue,
      label: colorText.custom,
      ...(custom === undefined ? {} : { color: custom }),
      ...described(custom, custom !== undefined),
      element: 'connection.custom-color@dialog',
    },
  ];
}

/** The list to pick from, titled **Color of <name>**. */
export function colorQuestion(list: ColorList): Outcome {
  const current = isHexColor(list.current) ? customValue : list.current;
  return ask({
    title: list.title,
    button: colorText.pick,
    fields: [
      { kind: 'pick-one', key: 'color', label: list.placeholder, default: current, choices: colorChoices(list) },
    ],
  });
}

/** What the dialog **Choose a color** is opened with: the name on its line, and the color it starts on. */
export interface CustomColorStart {
  readonly name: string;
  readonly start: ConnectionColor;
}

/** The dialog **Choose a color**, whose answer is the color under `customColor`. */
export function customColorQuestion(start: CustomColorStart): Outcome {
  return ask({
    title: customColorText.title,
    text: customColorText.line(start.name),
    button: customColorText.apply,
    element: 'connection.custom-color@dialog',
    about: { name: start.name, start: start.start } satisfies Readonly<Record<string, Json>>,
    fields: [
      {
        kind: 'text',
        key: 'customColor',
        label: customColorText.field,
        default: start.start,
        placeholder: customColorText.placeholder,
      },
    ],
  });
}

/** Whether a question is the dialog **Choose a color**, which the window draws with its own dialog. */
export function isCustomColorQuestion(question: { readonly element?: string }): boolean {
  return question.element === 'connection.custom-color@dialog';
}

/** What the dialog **Choose a color** of a question is opened with; undefined for another question. */
export function customColorAboutOf(question: {
  readonly element?: string;
  readonly about?: Json;
}): CustomColorStart | undefined {
  if (!isCustomColorQuestion(question)) {
    return undefined;
  }
  const about = jsonFields(question.about);
  const name = about['name'];
  const start = colorOfText(about['start']);
  return typeof name === 'string' && start !== undefined ? { name, start } : undefined;
}

function choiceOfValue(value: unknown): ColorChoice | undefined {
  if (value === noneValue || value === null) {
    return { kind: 'none' };
  }
  if (value === followValue) {
    return { kind: 'follow' };
  }
  if (value === customValue) {
    return { kind: 'custom' };
  }
  const color = colorOfText(value);
  return color === undefined ? undefined : { kind: 'color', color };
}

/**
 * What was chosen, from the answers (`color`, then `customColor` for **Custom color…**) or from the arguments the
 * feature was started with (`color`); `undefined` while nothing is chosen.
 */
export function chosenColor(answers: Answers, args: Readonly<Record<string, unknown>>): ColorChoice | undefined {
  const choice = choiceOfValue(answers['color'] ?? args['color']);
  if (choice?.kind !== 'custom') {
    return choice;
  }
  const custom = colorOfText(answers['customColor']);
  return custom === undefined ? choice : { kind: 'color', color: custom };
}
