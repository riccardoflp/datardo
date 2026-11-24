/**
 * Feature: connection.color-from-compass — the color of a connection in a file turned into one of Datardo's eleven
 * presets, or kept as a custom color in Datardo's and Mongoster's own formats, and a color turned back into Compass's
 * codes.
 */
import { colorOfText, isPresetColor, type ConnectionColor, type PresetColor } from '../../shared/color';
import { nearestPreset } from './color-presets';

/** Compass's codes (`use-connection-color.ts`): Green, Teal, Blue, Iris, Purple, Red, Pink, Orange, Yellow, Gray. */
const fromCompass: Readonly<Record<string, PresetColor>> = {
  color1: 'green',
  color2: 'teal',
  color3: 'blue',
  color4: 'indigo',
  color5: 'purple',
  color6: 'red',
  color7: 'pink',
  color8: 'orange',
  color9: 'yellow',
  color10: 'gray',
  iris: 'indigo',
};

/** Compass's code of each preset; brown, which Compass lacks, is its orange. */
const toCompass: Readonly<Record<PresetColor, string>> = {
  red: 'color6',
  orange: 'color8',
  yellow: 'color9',
  green: 'color1',
  blue: 'color3',
  purple: 'color5',
  pink: 'color7',
  teal: 'color2',
  indigo: 'color4',
  brown: 'color8',
  gray: 'color10',
};

/**
 * Feature: connection.color-from-compass — a preset from its name, a Compass code or name, any case; a hex color kept
 * as a custom color with `keepCustom` (Datardo's and Mongoster's formats), or its nearest preset otherwise (older
 * Compass wrote hex colors); undefined for anything else, or for what is not a string.
 */
export function colorFrom(value: unknown, keepCustom: 'keep-custom' | 'nearest-preset'): ConnectionColor | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.trim().toLowerCase();
  const code = Object.hasOwn(fromCompass, text) ? fromCompass[text] : undefined;
  if (code !== undefined) {
    return code;
  }
  const color = colorOfText(text);
  if (color === undefined || isPresetColor(color)) {
    return color;
  }
  return keepCustom === 'keep-custom' ? color : nearestPreset(color);
}

/** Feature: connection.color-from-compass — Compass's code of a color: a custom color's is its nearest preset's. */
export function compassColor(color: ConnectionColor): string {
  return toCompass[nearestPreset(color)];
}
