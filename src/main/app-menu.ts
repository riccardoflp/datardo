/**
 * `window.app-menu` in the main process: the system's menu bar on macOS, made from the menus the feature's view
 * returns and made again when what it shows changes. Windows and Linux have no menu bar.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron';
import { view, type MenuEntry, type Menu as MenuView } from '../features/window/app-menu';
import type { Intent } from '../shared/bridge';
import type { Platform } from '../shared/feature';
import type { AppStateHolder } from './app-state';

/** A key as the cards write it, as macOS's menus write it: `Ctrl+K` is `Cmd+K`, `Ctrl+Cmd+F` stays. */
export function macAccelerator(key: string): string {
  return key.includes('Cmd') ? key : key.replace(/\bCtrl\+/u, 'Cmd+');
}

function item(entry: MenuEntry, start: (intent: Intent) => void): MenuItemConstructorOptions {
  switch (entry.kind) {
    case 'separator':
      return { type: 'separator' };
    case 'role':
      return {
        ...(entry.element === undefined ? {} : { id: entry.element }),
        role: entry.role as NonNullable<MenuItemConstructorOptions['role']>,
      };
    case 'submenu':
      return { label: entry.title, submenu: entry.entries.map((inner) => item(inner, start)) };
    case 'command':
      return {
        ...(entry.element === undefined ? {} : { id: entry.element }),
        label: entry.title,
        enabled: entry.enabled,
        ...(entry.checked === undefined ? {} : { type: 'radio' as const, checked: entry.checked }),
        // The window takes the keys itself, as Go to lists them; the menu shows them.
        ...(entry.key === undefined ? {} : { accelerator: macAccelerator(entry.key), registerAccelerator: false }),
        click: () => {
          start(entry.intent);
        },
      };
  }
}

function template(menus: readonly MenuView[], start: (intent: Intent) => void): MenuItemConstructorOptions[] {
  return menus
    .filter((menu) => menu.entries.length > 0)
    .map((menu) => ({
      id: menu.element,
      label: menu.title,
      submenu: menu.entries.map((entry) => item(entry, start)),
    }));
}

/**
 * Sets the menu bar of the platform: macOS's, kept up to date with the state; none on Windows and Linux. **About
 * Datardo** is a dialog of the window, not a feature the runner starts: the menu asks the window to open it.
 */
export function setTheMenuBar(platform: Platform, holder: AppStateHolder, start: (intent: Intent) => void): void {
  if (platform !== 'macos') {
    Menu.setApplicationMenu(null);
    return;
  }
  const startOrAsk = (intent: Intent): void => {
    if (intent.feature === 'window.about') {
      holder.dispatch({ slice: 'window', type: 'changed', window: { aboutAsked: holder.get().window.aboutAsked + 1 } });
      return;
    }
    start(intent);
  };
  let shown = '';
  const build = (): void => {
    const menus = view(holder.get());
    const fingerprint = JSON.stringify(menus);
    if (fingerprint === shown) {
      return;
    }
    shown = fingerprint;
    Menu.setApplicationMenu(Menu.buildFromTemplate(template(menus, startOrAsk)));
  };
  build();
  holder.listen((event) => {
    if (event.slice !== 'runner' || event.type === 'dialog-opened' || event.type === 'dialog-closed') {
      build();
    }
  });
}
