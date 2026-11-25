/**
 * The options of Datardo's window: the frame of the platform (`window.frame`), the place it opens at
 * (`window.placement`), and what keeps the window process a sandbox (D27, R14.6). Kept apart from the start of the
 * main process so that a test can read them.
 */
import type { BrowserWindowConstructorOptions } from 'electron';
import { frame as frameOf, type Frame } from '../features/window/frame';
import { defaultSize, type Rectangle } from '../features/window/placement';
import { appName } from '../features/window/text';

/** The Content Security Policy of every page of the window: only the application's own files. */
export const contentSecurityPolicy = policyOf({ script: [], connect: [] });

/**
 * The policy while Datardo runs from the sources on Vite's development server (`npm run dev`, never in a packaged
 * Datardo): the page also runs the inline script the server writes into it, which starts React's refresh, and reaches
 * the server's socket for the changes of the sources (R14.6).
 */
export function developmentPolicy(server: string): string {
  const { host } = new URL(server);
  return policyOf({ script: ["'unsafe-inline'"], connect: [`ws://${host}`] });
}

function policyOf(more: { readonly script: readonly string[]; readonly connect: readonly string[] }): string {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...more.script].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    ["connect-src 'self'", ...more.connect].join(' '),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** The options of the window, with the bridge at `preload`, its frame and its bounds. */
export function windowOptions(
  preload: string,
  frame: Frame = frameOf('windows', 'dark'),
  bounds: Rectangle = { left: 0, top: 0, ...defaultSize },
): BrowserWindowConstructorOptions {
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    minWidth: frame.minWidth,
    minHeight: frame.minHeight,
    show: false,
    title: appName,
    backgroundColor: frame.backgroundColor,
    frame: frame.frame,
    ...(frame.titleBarStyle === 'default' ? {} : { titleBarStyle: frame.titleBarStyle }),
    ...(frame.titleBarOverlay === undefined ? {} : { titleBarOverlay: { ...frame.titleBarOverlay } }),
    autoHideMenuBar: !frame.menuBar,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  };
}
