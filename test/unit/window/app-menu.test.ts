import { describe, expect, it } from 'vitest';
import { commandIntent, view, type Menu, type MenuEntry } from '../../../src/features/window/app-menu';
import { commands } from '../../../src/features/commands';
import { command } from '../../../src/features/command';
import { type QuestionId, featureId } from '../../../src/shared/ids';
import { stateWith } from './context';

const repository = 'https://github.com/riccardoflp/datardo';

function titles(menu: Menu | undefined): string[] {
  return (menu?.entries ?? []).flatMap((entry) => (entry.kind === 'command' ? [entry.title] : []));
}

function find(menus: readonly Menu[], title: string): Extract<MenuEntry, { kind: 'command' }> | undefined {
  for (const entry of menus.flatMap((menu) => menu.entries)) {
    if (entry.kind === 'command' && entry.title === title) {
      return entry;
    }
    if (entry.kind === 'submenu') {
      const inside = entry.entries.find((item) => item.kind === 'command' && item.title === title);
      if (inside?.kind === 'command') {
        return inside;
      }
    }
  }
  return undefined;
}

describe('window.app-menu', () => {
  it('shows Datardo, File, Edit, View, Go, Window and Help, in this order', () => {
    expect(view(stateWith({ platform: 'macos' }), commands, { repository }).map((menu) => menu.title)).toEqual([
      'Datardo',
      'File',
      'Edit',
      'View',
      'Go',
      'Window',
      'Help',
    ]);
  });

  it("carries its identifier on every menu, and window.size's on the system's Minimize and Zoom", () => {
    const menus = view(stateWith({ platform: 'macos' }), commands, { repository });
    expect(new Set(menus.map((menu) => menu.element))).toEqual(new Set(['window.app-menu@app-menu']));
    expect(menus[5]?.entries.filter((entry) => entry.kind === 'role')).toEqual([
      { kind: 'role', role: 'minimize', element: 'window.size@app-menu' },
      { kind: 'role', role: 'zoom', element: 'window.size@app-menu' },
      { kind: 'role', role: 'front' },
    ]);
  });

  it('gives each entry of a registered command its title and key from Go to', () => {
    const menus = view(stateWith({ platform: 'macos' }), commands, { repository });
    expect(find(menus, 'Zoom in')).toMatchObject({ key: 'Ctrl+=', enabled: true, element: 'window.zoom@app-menu' });
    expect(find(menus, 'Quit Datardo')).toMatchObject({ key: 'Ctrl+Q', element: 'window.quit@app-menu' });
    for (const registered of commands) {
      const entry = find(menus, registered.title);
      if (entry !== undefined && registered.id !== 'window.full-screen') {
        expect(entry.key).toBe(registered.key);
      }
    }
  });

  it('with the explorer hidden reads Show explorer; with it shown, Hide explorer', () => {
    expect(titles(view(stateWith({ nav: { explorerHidden: true } }), commands)[3])).toContain('Show explorer');
    expect(titles(view(stateWith(), commands)[3])).toContain('Hide explorer');
  });

  it('disables an entry whose command is not registered or not offered', () => {
    const withoutPlayground = commands.filter((each) => each.id !== 'playground.open');
    const menus = view(stateWith({ settings: { 'datardo.window.zoom': 200 } }), withoutPlayground, { repository });
    expect(find(menus, 'Zoom in')?.enabled).toBe(false);
    expect(find(menus, 'New playground')?.enabled).toBe(false);
    const withPlayground = [...withoutPlayground, command('playground.open', 'New playground')];
    expect(find(view(stateWith(), withPlayground, { repository }), 'New playground')?.enabled).toBe(true);
  });

  it('marks the theme in use in View › Theme', () => {
    const menus = view(stateWith({ settings: { 'datardo.window.theme': 'light' } }), commands, { repository });
    expect(find(menus, 'Light')?.checked).toBe(true);
    expect(find(menus, 'Dark')?.checked).toBe(false);
    expect(find(menus, 'Follow the system')?.intent).toEqual(commandIntent('window.theme:system', 'app-menu'));
  });

  it('while a dialog is open, keeps enabled only the entries of Datardo, Edit and Window', () => {
    const dialog = {
      kind: 'question' as const,
      id: 'd1' as QuestionId,
      feature: featureId('connection.add'),
      question: { title: 'Add', button: 'Add', fields: [] },
    };
    const menus = view(stateWith({ runner: { dialogs: [dialog] } }), commands, { repository });
    expect(find(menus, 'About Datardo')?.enabled).toBe(true);
    expect(find(menus, 'Zoom in')?.enabled).toBe(false);
    expect(find(menus, 'Documentation')?.enabled).toBe(false);
  });

  it('opens Documentation and Report an issue in the browser, and has no Help entries without a repository', () => {
    const menus = view(stateWith(), commands, { repository });
    expect(find(menus, 'Report an issue')?.intent.args).toEqual({ address: `${repository}/issues` });
    expect(titles(view(stateWith(), commands, { repository: undefined })[6])).toEqual([]);
  });

  it('reads Exit full screen while in full screen', () => {
    expect(find(view(stateWith({ window: { fullScreen: true } }), commands), 'Exit full screen')).toBeDefined();
  });

  it('turns a command into the intent of its feature, with its variant as arguments', () => {
    expect(commandIntent('window.zoom:in', 'app-menu')).toEqual({
      feature: 'window.zoom',
      target: { kind: 'app' },
      place: 'app-menu',
      args: 'in',
    });
    expect(commandIntent('window.quit')).toEqual({ feature: 'window.quit', target: { kind: 'app' } });
  });
});
