/**
 * How the window looks, from the settings: the theme (`window.theme`) and the zoom (`window.zoom`). The window follows
 * the settings whoever writes them: a command, the Settings page, the settings file read at start.
 */
import { nativeTheme, type BrowserWindow } from 'electron';
import { frame, type ThemeInUse } from '../features/window/frame';
import { themeChoice } from '../features/window/theme';
import { zoomInUse } from '../features/window/zoom';
import type { Platform } from '../shared/feature';
import type { AppState } from '../shared/state';
import type { AppStateHolder } from './app-state';

/**
 * Gives the system the theme chosen, so that the window's color scheme, the system's buttons, menus and file dialogs
 * follow it, and says in the state whether the window is dark now.
 */
export function applyTheme(holder: AppStateHolder): ThemeInUse {
  const choice = themeChoice(holder.get().settings);
  if (nativeTheme.themeSource !== choice) {
    nativeTheme.themeSource = choice;
  }
  const dark = nativeTheme.shouldUseDarkColors;
  if (holder.get().window.dark !== dark) {
    holder.dispatch({ slice: 'window', type: 'changed', window: { dark } });
  }
  return dark ? 'dark' : 'light';
}

/** Colors the frame of an open window in the theme: its background and, on Windows, the system's buttons. */
export function colorTheFrame(window: BrowserWindow, platform: Platform, theme: ThemeInUse): void {
  if (window.isDestroyed()) {
    return;
  }
  const theFrame = frame(platform, theme);
  window.setBackgroundColor(theFrame.backgroundColor);
  if (theFrame.titleBarOverlay !== undefined) {
    window.setTitleBarOverlay({ ...theFrame.titleBarOverlay });
  }
}

/** Draws the window at the zoom of the setting. */
export function applyZoom(window: BrowserWindow, state: AppState): void {
  if (window.isDestroyed()) {
    return;
  }
  const factor = zoomInUse(state.settings) / 100;
  if (window.webContents.getZoomFactor() !== factor) {
    window.webContents.setZoomFactor(factor);
  }
}

/** Keeps the window's theme and zoom those of the settings and of the system, from now on. */
export function followTheLook(
  holder: AppStateHolder,
  window: () => BrowserWindow | undefined,
  platform: Platform,
): void {
  const apply = (): void => {
    const theme = applyTheme(holder);
    const open = window();
    if (open !== undefined) {
      colorTheFrame(open, platform, theme);
      applyZoom(open, holder.get());
    }
  };
  holder.listen((event) => {
    if (event.slice === 'settings') {
      apply();
    }
  });
  nativeTheme.on('updated', apply);
}
