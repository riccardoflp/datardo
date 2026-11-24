import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { settingValue, settingsSchema } from '../../../src/features/settings/read';

describe('settings.read', () => {
  it('gives the default of a setting that is not stored', () => {
    expect(settingValue(settingsSchema, {}, 'datardo.undo.maxDays')).toBe(7);
    expect(settingValue(settingsSchema, {}, 'datardo.mcp.port')).toBe(37018);
  });

  it('ignores a stored value of the wrong type', () => {
    expect(settingValue(settingsSchema, { 'datardo.undo.maxDays': 'ten' }, 'datardo.undo.maxDays')).toBe(7);
  });

  it('brings a number outside the bounds to the nearest bound', () => {
    expect(settingValue(settingsSchema, { 'datardo.window.zoom': 500 }, 'datardo.window.zoom')).toBe(200);
    expect(settingValue(settingsSchema, { 'datardo.window.zoom': 10 }, 'datardo.window.zoom')).toBe(50);
  });

  it('ignores a value that is not one of the choices', () => {
    expect(settingValue(settingsSchema, { 'datardo.window.theme': 'blue' }, 'datardo.window.theme')).toBe('system');
  });

  it('declares every setting of the table of settings.md with the same default, and no other', () => {
    const page = readFileSync('docs/features/settings.md', 'utf8');
    // A setting read only by cards not built yet (Specified, Reviewed in the index) is planned: its milestone
    // declares it, as check_catalog.py leaves it out.
    const index = readFileSync('docs/features/README.md', 'utf8');
    const planned = new Set(
      [...index.matchAll(/^\| \[`([a-z][\w-]*\.[a-z][\w-]*)`\].*\| (Specified|Reviewed) \|$/gmu)].map(
        (match) => match[1],
      ),
    );
    const rows = [...page.matchAll(/^\| `(datardo\.[\w.]+)` \| ([^|]+) \|(.*)$/gmu)]
      .filter((match) => {
        const readers = [...((match[3] ?? '').split('|')[2] ?? '').matchAll(/`([a-z][\w-]*\.[a-z][\w-]*)`/gu)];
        return readers.length === 0 || readers.some((reader) => !planned.has(reader[1]));
      })
      .map((match) => [match[1] ?? '', (match[2] ?? '').trim()]);
    expect(Object.keys(settingsSchema.properties).sort()).toEqual(rows.map(([name]) => name).sort());
    for (const [name, written] of rows) {
      const value = settingsSchema.properties[name ?? '']?.default;
      const expected =
        written === 'on'
          ? true
          : written === 'off'
            ? false
            : /^[\d,]+$/u.test(written ?? '')
              ? Number((written ?? '').replaceAll(',', ''))
              : (written ?? '').replaceAll('`', '');
      expect([name, value]).toEqual([name, expected]);
    }
  });
});
