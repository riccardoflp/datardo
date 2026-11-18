/**
 * Feature: window.frame
 *
 * The frame of the window on each platform: Datardo draws the whole window, and the system keeps only its own buttons
 * where it can draw them over the top bar.
 */
import type { Platform } from '../../shared/feature';
import { minimumSize } from './placement';

/** The two themes the window is drawn in (`window.theme`, once `system` is resolved). */
export type ThemeInUse = 'dark' | 'light';

/** The height of the top bar, in pixels (Datardo's choice). */
export const topBarHeight = 40;

/** The colors of the frame in each theme: those of the tokens `--color-canvas` and `--color-text`. */
export const frameColors: Readonly<Record<ThemeInUse, { readonly background: string; readonly symbols: string }>> = {
  dark: { background: '#101216', symbols: '#e6e8ec' },
  light: { background: '#eceef2', symbols: '#1b1e24' },
};

/** Who draws the window's buttons. */
export type WindowButtons = 'system' | 'datardo' | 'none';

/** The options the main process creates the window with, and the room the top bar leaves the system. */
export interface Frame {
  /** Electron's style of title bar: `hidden` with an overlay, `hiddenInset`, or none at all (`frame: false`). */
  readonly titleBarStyle: 'hidden' | 'hiddenInset' | 'default';
  readonly frame: boolean;
  /** The system's buttons drawn over the top bar, on Windows. */
  readonly titleBarOverlay?: { readonly color: string; readonly symbolColor: string; readonly height: number };
  /** The pixels the top bar leaves free at each end, for the system's buttons. */
  readonly room: { readonly left: number; readonly right: number };
  /** Who draws minimize, maximize and close at the right of the top bar. */
  readonly buttons: WindowButtons;
  readonly menuBar: boolean;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly backgroundColor: string;
}

/** The room of the system's three buttons on Windows at 100% scaling. */
const windowsButtonsWidth = 138;

/** The room left for the system's three buttons on macOS (Datardo's choice). */
const macButtonsWidth = 78;

/** The size of each of Datardo's own buttons on Linux (Datardo's choice). */
export const linuxButtonSize = { width: 46, height: topBarHeight } as const;

/**
 * Feature: window.frame
 *
 * The options of the window for a platform and a theme; they depend on nothing else.
 */
export function frame(platform: Platform, theme: ThemeInUse): Frame {
  const colors = frameColors[theme];
  const common = {
    minWidth: minimumSize.width,
    minHeight: minimumSize.height,
    backgroundColor: colors.background,
  };
  switch (platform) {
    case 'windows':
      return {
        ...common,
        titleBarStyle: 'hidden',
        frame: true,
        titleBarOverlay: { color: colors.background, symbolColor: colors.symbols, height: topBarHeight },
        room: { left: 0, right: windowsButtonsWidth },
        buttons: 'system',
        menuBar: false,
      };
    case 'macos':
      return {
        ...common,
        titleBarStyle: 'hiddenInset',
        frame: true,
        room: { left: macButtonsWidth, right: 0 },
        buttons: 'none',
        menuBar: true,
      };
    case 'linux':
      return {
        ...common,
        titleBarStyle: 'default',
        frame: false,
        room: { left: 0, right: 0 },
        buttons: 'datardo',
        menuBar: false,
      };
  }
}
