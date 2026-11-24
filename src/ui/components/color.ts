/**
 * How an element is drawn in a color of a connection, a database or a collection (`connection.color-presets`): a
 * preset by its name in `data-color`, which `theme/base.css` turns into its token of the theme in use; a custom color
 * as `data-color="custom"` with the color itself in `--connection-color`, the same in both themes. The styles read
 * `--connection-color` under `[data-color]`.
 */
import type { CSSProperties } from 'react';
import { isPresetColor, type ConnectionColor } from '../../shared/color';

/** The attributes of an element drawn in a color; none for no color. */
export interface ColorAttributes {
  readonly 'data-color'?: string;
  readonly style?: CSSProperties;
}

/** The attributes that draw an element in `color`, to spread on it: `{...colorAttributes(color)}`. */
export function colorAttributes(color: ConnectionColor | undefined): ColorAttributes {
  if (color === undefined) {
    return {};
  }
  if (isPresetColor(color)) {
    return { 'data-color': color };
  }
  return { 'data-color': 'custom', style: { '--connection-color': color } as CSSProperties };
}
