import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorLabel, nearestPreset, presetColors, readColor } from '../../../src/features/connection/color-presets';
import { startState, view, withPicked, withSwatch } from '../../../src/features/connection/custom-color';

const tokens = readFileSync(join(import.meta.dirname, '..', '..', '..', 'src', 'ui', 'theme', 'tokens.css'), 'utf8');
const [darkBlock = '', lightBlock = ''] = tokens.split('@media (prefers-color-scheme: light)');

function tokenOf(block: string, preset: string): string | undefined {
  return new RegExp(`--color-connection-${preset}:\\s*(#[0-9a-f]{6});`, 'u').exec(block)?.[1];
}

describe('connection.color-presets', () => {
  it('has the eleven presets in their order', () => {
    expect(presetColors).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'teal',
      'indigo',
      'brown',
      'gray',
    ]);
  });

  it('reads a color from a text as the examples say', () => {
    expect(readColor(' Teal ')).toBe('teal');
    expect(readColor('#1E90FF')).toBe('#1e90ff');
    expect(readColor('abc')).toBe('#aabbcc');
    expect(readColor('#12345')).toBeUndefined();
    expect(readColor('chartreuse')).toBeUndefined();
    expect(readColor(7)).toBeUndefined();
  });

  it('gives the nearest preset of each example', () => {
    const examples = {
      '#ff0000': 'red',
      '#ffa500': 'orange',
      '#20b2aa': 'teal',
      '#1e90ff': 'blue',
      '#5c6bc0': 'indigo',
      '#4b0082': 'purple',
      '#ff69b4': 'pink',
      '#8b4513': 'brown',
      '#808080': 'gray',
      '#12abef': 'blue',
    } as const;
    for (const [color, preset] of Object.entries(examples)) {
      expect(nearestPreset(color as `#${string}`), color).toBe(preset);
    }
    expect(nearestPreset('pink')).toBe('pink');
  });

  it('labels a preset by its name and a custom color as it is kept', () => {
    expect(colorLabel('pink')).toBe('Pink');
    expect(colorLabel('#12abef')).toBe('#12abef');
  });

  it('has the eleven tokens with the values of the table in each theme', () => {
    const table = {
      red: ['#ff7a7a', '#bb2828'],
      orange: ['#ffa45c', '#a94e08'],
      yellow: ['#f2c35b', '#7f5300'],
      green: ['#5bd38c', '#17703e'],
      blue: ['#7db8ff', '#1d55c2'],
      purple: ['#c4a7ff', '#7136c8'],
      pink: ['#f58cc3', '#a8245c'],
      teal: ['#4fd1c5', '#00706a'],
      indigo: ['#9fa8ff', '#4041b5'],
      brown: ['#d4a373', '#7a4a24'],
      gray: ['#a9b0bb', '#5b6270'],
    };
    for (const [preset, [dark, light]] of Object.entries(table)) {
      expect(tokenOf(darkBlock, preset), `dark ${preset}`).toBe(dark);
      expect(tokenOf(lightBlock, preset), `light ${preset}`).toBe(light);
    }
  });
});

describe('connection.custom-color', () => {
  it('opens on Local, colored red, with Color of Local, the swatch Red selected and the field red', () => {
    const shown = view(startState('Local', 'red'));
    expect(shown.title).toBe('Choose a color');
    expect(shown.line).toBe('Color of Local');
    expect(shown.field).toMatchObject({ label: 'Color', placeholder: '#rrggbb', value: 'red' });
    expect(shown.swatches.items.filter((swatch) => swatch.selected).map((swatch) => swatch.label)).toEqual(['Red']);
    expect(shown.swatches.items.map((swatch) => swatch.label)).toHaveLength(11);
    expect(shown.cancel.label).toBe('Cancel');
    expect(shown.apply).toEqual({ label: 'Apply', element: 'connection.custom-color@dialog', enabled: true });
  });

  it('moves the picker and the preview to #1E90FF typed in the field, and applies #1e90ff', () => {
    const shown = view({ ...startState('Local', 'red'), text: '#1E90FF' });
    expect(shown.picker.color).toBe('#1e90ff');
    expect(shown.preview.color).toBe('#1e90ff');
    expect(shown.color).toBe('#1e90ff');
    expect(shown.swatches.items.some((swatch) => swatch.selected)).toBe(false);
  });

  it('applies #aabbcc for #abc', () => {
    expect(view({ name: 'Local', text: '#abc' }).color).toBe('#aabbcc');
  });

  it('gives the preset teal for its swatch, and the field shows its name', () => {
    const state = withSwatch(startState('Local', 'red'), 'teal');
    expect(state.text).toBe('teal');
    expect(view(state).color).toBe('teal');
  });

  it('disables Apply and says Enter a color as #rrggbb for #12345', () => {
    const shown = view({ name: 'Local', text: '#12345' });
    expect(shown.apply.enabled).toBe(false);
    expect(shown.field.problem).toBe('Enter a color as #rrggbb');
    expect(shown.color).toBeUndefined();
  });

  it('writes the color the picker gives in the field, in lower case', () => {
    expect(withPicked(startState('Local', 'red'), '#1E90FF').text).toBe('#1e90ff');
    expect(withPicked(startState('Local', 'red'), 'not a color').text).toBe('red');
  });
});
