/**
 * Feature: connection.custom-color
 *
 * The dialog **Choose a color**, opened by **Custom color…**: a color of the user's own, as `#rrggbb`, for a
 * connection, a database or a collection. The system's color picker and the field **Color** follow each other; a
 * swatch chooses a preset itself, which stays drawn with its token in each theme; **Apply** gives the color to the
 * feature that opened the dialog, which writes it as its card says.
 */
import { colorOfText, isPresetColor, presetColors, type ConnectionColor, type PresetColor } from '../../shared/color';
import { customColorText, presetLabels } from './parts/color-text';

/** What the dialog is drawn from: the name on its line, and the text of the field as it is typed. */
export interface CustomColorState {
  readonly name: string;
  /** The field **Color**: a hex color, any case, with or without `#`, or a preset's name. */
  readonly text: string;
}

/** A swatch of a preset. */
export interface SwatchView {
  readonly color: PresetColor;
  /** **Red** to **Gray**, said to a screen reader and shown when the pointer rests on it. */
  readonly label: string;
  readonly selected: boolean;
}

/** What the dialog shows. */
export interface CustomColorView {
  readonly title: string;
  /** **Color of <name>**. */
  readonly line: string;
  /** The system's color picker, on the color read from the field; a preset is drawn with its token. */
  readonly picker: { readonly label: string; readonly color?: ConnectionColor };
  readonly field: {
    readonly label: string;
    readonly placeholder: string;
    readonly value: string;
    /** **Enter a color as #rrggbb**, while the field reads as no color. */
    readonly problem?: string;
  };
  readonly swatches: { readonly label: string; readonly items: readonly SwatchView[] };
  /** The dot and the band of a card, and the icon of a tab, in the color read from the field. */
  readonly preview: { readonly label: string; readonly tab: string; readonly color?: ConnectionColor };
  readonly cancel: { readonly label: string; readonly element: string };
  readonly apply: { readonly label: string; readonly element: string; readonly enabled: boolean };
  /** The color **Apply** gives, while the field reads as one. */
  readonly color?: ConnectionColor;
  /** The identifier every control of the dialog carries. */
  readonly element: string;
}

/** The state the dialog starts in: the color in use (a custom color, or a preset with its swatch selected). */
export function startState(name: string, start: ConnectionColor): CustomColorState {
  return { name, text: start };
}

/**
 * Feature: connection.custom-color — what the dialog shows for the text of its field: the picker, the swatch
 * selected and the preview on the color read, and **Apply** disabled with **Enter a color as #rrggbb** while it
 * reads as no color.
 */
export function view(state: CustomColorState): CustomColorView {
  const color = colorOfText(state.text);
  const colored = color === undefined ? {} : { color };
  return {
    title: customColorText.title,
    line: customColorText.line(state.name),
    picker: { label: customColorText.picker, ...colored },
    field: {
      label: customColorText.field,
      placeholder: customColorText.placeholder,
      value: state.text,
      ...(color === undefined ? { problem: customColorText.invalid } : {}),
    },
    swatches: {
      label: customColorText.swatches,
      items: presetColors.map((preset) => ({ color: preset, label: presetLabels[preset], selected: preset === color })),
    },
    preview: { label: customColorText.preview, tab: customColorText.previewTab, ...colored },
    cancel: { label: customColorText.cancel, element: 'connection.custom-color@dialog' },
    apply: { label: customColorText.apply, element: 'connection.custom-color@dialog', enabled: color !== undefined },
    ...colored,
    element: 'connection.custom-color@dialog',
  };
}

/** The text of the field once a swatch is chosen: the preset's name, which the field shows (`teal`). */
export function withSwatch(state: CustomColorState, preset: PresetColor): CustomColorState {
  return { ...state, text: preset };
}

/** The text of the field once the picker moved: the color as it is kept, `#rrggbb` in lower case. */
export function withPicked(state: CustomColorState, picked: string): CustomColorState {
  const color = colorOfText(picked);
  return color === undefined || isPresetColor(color) ? state : { ...state, text: color };
}
