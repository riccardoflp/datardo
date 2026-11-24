/**
 * Feature: connection.color-presets — the eleven colors offered wherever something is colored, a color of the user's
 * own as `#rrggbb`, how a color read from a text is told, and the preset nearest to a custom color, which a Compass
 * file needs. A preset is drawn with its token of the theme in use, `--color-connection-<name>`; a custom color as it
 * is, in both themes.
 */
import {
  colorOfText,
  isPresetColor,
  presetColors,
  type ConnectionColor,
  type HexColor,
  type PresetColor,
} from '../../shared/color';

export { presetColors };

/** The hue of each preset but gray, brown and indigo, which the nearest preset tells apart otherwise. */
const hues = {
  red: 0,
  orange: 30,
  yellow: 55,
  green: 125,
  teal: 170,
  blue: 215,
  purple: 280,
  pink: 330,
} as const satisfies Partial<Record<PresetColor, number>>;

type HuedPreset = keyof typeof hues;

/** The difference between the largest and the smallest channel under which a color is gray. */
const grayUnder = 0.12;

/** The largest channel under which a color of a hue from 10° to 45° is brown. */
const brownUnder = 0.65;

/** The largest channel under which a blue of a hue of 220° or more is indigo. */
const indigoUnder = 0.8;

/**
 * Feature: connection.color-presets — a color read from a field, a file or a setting: a preset by its name, any case,
 * spaces around; `#rrggbb` and `#rgb`, with or without `#`, as `#rrggbb` in lower case; otherwise none.
 */
export function readColor(value: unknown): ConnectionColor | undefined {
  return colorOfText(value);
}

function channelsOf(color: HexColor): readonly [number, number, number] {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16) / 255);
  return [red, green, blue];
}

function hueOf(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const spread = max - Math.min(red, green, blue);
  const sixth =
    max === red
      ? ((green - blue) / spread) % 6
      : max === green
        ? (blue - red) / spread + 2
        : (red - green) / spread + 4;
  return (sixth * 60 + 360) % 360;
}

function nearestHue(hue: number): HuedPreset {
  const distance = (preset: HuedPreset): number => {
    const apart = Math.abs(hue - hues[preset]);
    return Math.min(apart, 360 - apart);
  };
  const presets = Object.keys(hues) as HuedPreset[];
  return presets.reduce((best, preset) => (distance(preset) < distance(best) ? preset : best));
}

/**
 * Feature: connection.color-presets — the preset nearest to a color: a preset is itself; a custom color with almost
 * no saturation is gray, a dark orange brown, a deep blue indigo, and otherwise the preset of the nearest hue.
 */
export function nearestPreset(color: ConnectionColor): PresetColor {
  if (isPresetColor(color)) {
    return color;
  }
  const [red, green, blue] = channelsOf(color);
  const max = Math.max(red, green, blue);
  if (max - Math.min(red, green, blue) < grayUnder) {
    return 'gray';
  }
  const hue = hueOf(red, green, blue);
  if (max < brownUnder && hue >= 10 && hue <= 45) {
    return 'brown';
  }
  const nearest = nearestHue(hue);
  return nearest === 'blue' && hue >= 220 && max < indigoUnder ? 'indigo' : nearest;
}

/** Feature: connection.color-presets — the name a color is shown with: **Pink**, or a custom color as it is kept. */
export function colorLabel(color: ConnectionColor): string {
  return isPresetColor(color) ? `${color.charAt(0).toUpperCase()}${color.slice(1)}` : color;
}
