import { describe, expect, it } from 'vitest';
import { frame, frameColors } from '../../../src/features/window/frame';

describe('window.frame', () => {
  it('on Windows, dark: the system draws its buttons over the top bar, 40 px high, in the dark colors', () => {
    const result = frame('windows', 'dark');
    expect(result.titleBarStyle).toBe('hidden');
    expect(result.titleBarOverlay).toEqual({
      color: frameColors.dark.background,
      symbolColor: frameColors.dark.symbols,
      height: 40,
    });
    expect(result.room).toEqual({ left: 0, right: 138 });
    expect(result.buttons).toBe('system');
    expect(result.menuBar).toBe(false);
    expect([result.minWidth, result.minHeight]).toEqual([640, 400]);
  });

  it('on Windows, light: the system buttons take the light colors', () => {
    expect(frame('windows', 'light').titleBarOverlay?.symbolColor).toBe(frameColors.light.symbols);
    expect(frame('windows', 'light').backgroundColor).toBe(frameColors.light.background);
  });

  it('on macOS, light: the inset buttons, 78 px left free, the menu bar', () => {
    const result = frame('macos', 'light');
    expect(result.titleBarStyle).toBe('hiddenInset');
    expect(result.room).toEqual({ left: 78, right: 0 });
    expect(result.menuBar).toBe(true);
    expect([result.minWidth, result.minHeight]).toEqual([640, 400]);
  });

  it("on Linux, dark: no frame, Datardo's own buttons, no menu bar", () => {
    const result = frame('linux', 'dark');
    expect(result.frame).toBe(false);
    expect(result.buttons).toBe('datardo');
    expect(result.menuBar).toBe(false);
    expect([result.minWidth, result.minHeight]).toEqual([640, 400]);
  });

  it('starts with the background of the theme, never white', () => {
    expect(frame('windows', 'dark').backgroundColor).toBe('#0b0d11');
  });

  it('keeps the colors of the frame those of the tokens of each theme', async () => {
    const { readFile } = await import('node:fs/promises');
    const tokens = await readFile('src/ui/theme/tokens.css', 'utf8');
    const dark = /:root \{[^}]*--color-canvas: (#[0-9a-f]+);[^}]*--color-text: (#[0-9a-f]+);/u.exec(tokens);
    expect(dark?.slice(1)).toEqual([frameColors.dark.background, frameColors.dark.symbols]);
    const light =
      /prefers-color-scheme: light\)[^}]*--color-canvas: (#[0-9a-f]+);[^}]*--color-text: (#[0-9a-f]+);/u.exec(tokens);
    expect(light?.slice(1)).toEqual([frameColors.light.background, frameColors.light.symbols]);
  });
});
