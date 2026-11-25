/**
 * What keeps the window process to Datardo's own pages (D27, R14.6, T7, T19): it never navigates, never opens a
 * second window, and a link it asks for goes to `window.open-link`, which opens only web links in the system's browser.
 */
import { session, type BrowserWindow } from 'electron';
import type { Intent } from '../shared/bridge';
import { featureId } from '../shared/ids';
import { appTarget } from '../shared/target';
import { contentSecurityPolicy, developmentPolicy } from './window-options';

/** The intent of opening a link the page asked for. */
function openLink(address: string): Intent {
  return { feature: featureId('window.open-link'), target: appTarget, args: { address } };
}

/** The permissions the window may have: writing text to the clipboard (**Copy**), and nothing else. */
const allowedPermissions = new Set(['clipboard-sanitized-write']);

/**
 * Sets the content policy and the permissions of every page of the window: once, before the window opens. `server` is
 * Vite's development server when Datardo runs from the sources, never in a packaged Datardo.
 */
export function guardTheSession(server?: string): void {
  const policy = server === undefined ? contentSecurityPolicy : developmentPolicy(server);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] },
    });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowedPermissions.has(permission));
}

/**
 * Keeps the window on its own page: a new window is never opened, a navigation is never followed, and what the page
 * asked for is handed to `window.open-link`, which refuses anything but a web link.
 */
export function guardTheWindow(window: BrowserWindow, start: (intent: Intent) => void): void {
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    start(openLink(url));
    return { action: 'deny' };
  });
  contents.on('will-frame-navigate', (event) => {
    event.preventDefault();
    if (event.isMainFrame) {
      start(openLink(event.url));
    }
  });
  contents.on('will-redirect', (event) => {
    event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
    // Pinch zoom stays as it was; the zoom of the setting still applies. Safe to go on.
    console.warn('The pinch zoom could not be turned off:', error);
  });
}
