/**
 * Feature: connection.color-from-compass — the color of a connection in a file turned into one of Datardo's six, and
 * Datardo's colors into Compass's codes.
 */
import type { ConnectionColor } from '../../shared/connection';
import { connectionColors } from '../../shared/connection';

/** Compass's codes (`use-connection-color.ts`): Green, Teal, Blue, Iris, Purple, Red, Pink, Orange, Yellow, Gray. */
const fromCompass: Readonly<Record<string, ConnectionColor | 'none'>> = {
  color1: 'green',
  color2: 'green',
  color3: 'blue',
  color4: 'blue',
  color5: 'purple',
  color6: 'red',
  color7: 'purple',
  color8: 'orange',
  color9: 'yellow',
  color10: 'none',
  teal: 'green',
  iris: 'blue',
  pink: 'purple',
};

const toCompass: Readonly<Record<ConnectionColor, string>> = {
  red: 'color6',
  orange: 'color8',
  yellow: 'color9',
  green: 'color1',
  blue: 'color3',
  purple: 'color5',
};

const hues: Readonly<Record<ConnectionColor, number>> = {
  red: 0,
  orange: 30,
  yellow: 55,
  green: 125,
  blue: 215,
  purple: 280,
};

/** The difference between the largest and the smallest channel under which a color is a gray. */
const grayUnder = 0.12;

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

function closestToHex(hex: string): ConnectionColor | undefined {
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
  if (Math.max(red, green, blue) - Math.min(red, green, blue) < grayUnder) {
    return undefined;
  }
  const hue = hueOf(red, green, blue);
  const distance = (color: ConnectionColor): number => {
    const apart = Math.abs(hue - hues[color]);
    return Math.min(apart, 360 - apart);
  };
  return connectionColors.reduce((best, color) => (distance(color) < distance(best) ? color : best));
}

/**
 * Feature: connection.color-from-compass — one of the six from a color name, a Compass code or a hex color of older
 * Compass; undefined for a gray, for anything else, or for what is not a string.
 */
export function colorFrom(value: unknown): ConnectionColor | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const text = value.trim().toLowerCase();
  const named = connectionColors.find((color) => color === text);
  if (named !== undefined) {
    return named;
  }
  const code = Object.hasOwn(fromCompass, text) ? fromCompass[text] : undefined;
  if (code !== undefined) {
    return code === 'none' ? undefined : code;
  }
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)?.[1];
  return hex === undefined ? undefined : closestToHex(hex);
}

/** Feature: connection.color-from-compass — Compass's code of a color. */
export function compassColor(color: ConnectionColor): string {
  return toCompass[color];
}
