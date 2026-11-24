/**
 * The actions of the window area the runner carries out for app steps and app reads: what the plans of the window's
 * cards say, done to the one window, the tray, the system's file manager and browser.
 */
import { shell } from 'electron';
import type { AreaActions } from '.';
import type { AppAction } from '../../runner/ports';
import type { Json } from '../../shared/engine-request';
import { folderNotOpenedError } from '../../features/window/open-data-folder';
import { isWebLink } from '../../features/window/open-link';
import { placementOf } from '../../features/window/remember';
import type { MainServices } from '../services';
import { windowHost } from '../window-host';

function field(args: Json, name: string): Json | undefined {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)[name]
    : undefined;
}

/** An action done to the window, when it exists. */
function onTheWindow(act: (window: Electron.BrowserWindow) => void): AppAction {
  return () => {
    const window = windowHost.current();
    if (window !== undefined) {
      act(window);
    }
    return Promise.resolve();
  };
}

const savePlacement: AppAction = async (args) => {
  const placement = placementOf(args);
  if (placement !== undefined) {
    await windowHost.need().place.save(placement);
  }
};

/**
 * `window.open-folder`: the data folder in the system's file manager. The folder is the main process's own, never a
 * path the window gives (T24, R14.10).
 */
function openFolder(services: MainServices): AppAction {
  return async () => {
    const path = services.dataFolder;
    const failure = path === '' ? 'no folder' : await shell.openPath(path);
    if (failure !== '') {
      const { code, message } = folderNotOpenedError(path);
      throw Object.assign(new Error(message), { code });
    }
  };
}

const openLink: AppAction = async (args) => {
  const address = field(args, 'address');
  // The plan has refused anything else already; this is the last guard before the system is asked (R14.6, T19).
  if (typeof address !== 'string' || !isWebLink(address)) {
    throw new Error('Datardo opens only web links.');
  }
  await shell.openExternal(address.trim());
};

const quit: AppAction = async (args) => {
  const waitMs = field(args, 'waitMs');
  await windowHost.quit(typeof waitMs === 'number' ? waitMs : 0);
};

/** The actions of this area, by name. */
export const actions: AreaActions = (services) => ({
  'window.save-placement': savePlacement,
  'window.minimize': onTheWindow((window) => {
    window.minimize();
  }),
  'window.maximize': onTheWindow((window) => {
    window.maximize();
  }),
  'window.restore': onTheWindow((window) => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.restore();
    }
  }),
  'window.set-full-screen': (args) => {
    const window = windowHost.current();
    window?.setFullScreen(field(args, 'on') === true);
    return Promise.resolve();
  },
  'window.show': () => windowHost.show(),
  'window.focus': onTheWindow(() => {
    windowHost.focus();
  }),
  'window.hide': onTheWindow(() => {
    windowHost.hide();
  }),
  'window.show-tray': () => {
    windowHost.showTray();
    return Promise.resolve();
  },
  'window.quit': quit,
  'window.open-folder': openFolder(services),
  'window.open-link': openLink,
});
