import { describe, expect, it } from 'vitest';
import { commands as registeredCommands } from '../../../src/features/commands';
import { commands } from '../../../src/features/palette/commands';
import { commandFor, type Focus, type KeyPress } from '../../../src/features/palette/key-press';
import { intentOf, isRepeated, offeredCommands } from '../../../src/features/palette/run-command';
import { feature as runCommand } from '../../../src/features/palette/run-command';
import { contextOf } from '../tab/harness';
import { cacheLocal, harness, local, orders } from './harness';

/** The table of the card: command, title, keys on Windows and Linux, keys on macOS. */
const table: readonly (readonly [string, string, readonly string[], readonly string[]])[] = [
  ['palette.open', 'Go to…', ['Ctrl+K'], ['Cmd+K']],
  ['palette.open:commands', 'Show all commands', ['Ctrl+Shift+P'], ['Cmd+Shift+P']],
  ['palette.open:tabs', 'Show open tabs', [], []],
  ['home.show', 'Home', ['Alt+Home'], ['Cmd+Shift+H']],
  ['nav.switch-connection', 'Switch connection…', ['Ctrl+Shift+O'], ['Cmd+Shift+O']],
  ['nav.toggle-explorer', 'Hide explorer', ['Ctrl+B'], ['Cmd+B']],
  ['nav.toggle-inspector', 'Hide inspector', ['Ctrl+Shift+B'], ['Cmd+Shift+B']],
  ['nav.resize:reset', 'Reset island widths', [], []],
  ['nav.focus-island:next', 'Focus next island', ['F6'], ['F6']],
  ['nav.focus-island:previous', 'Focus previous island', ['Shift+F6'], ['Shift+F6']],
  ['nav.back:back', 'Back', ['Alt+Left'], ['Cmd+[']],
  ['nav.back:forward', 'Forward', ['Alt+Right'], ['Cmd+]']],
  ['nav.copy-path', 'Copy path', [], []],
  ['nav.open-on-another-connection', 'Open on another connection…', [], []],
  ['tab.activate:next', 'Next tab', ['Ctrl+Tab', 'Ctrl+PageDown'], ['Ctrl+Tab', 'Cmd+Option+Right']],
  ['tab.activate:previous', 'Previous tab', ['Ctrl+Shift+Tab', 'Ctrl+PageUp'], ['Ctrl+Shift+Tab', 'Cmd+Option+Left']],
  ['tab.activate:1', 'Go to tab 1', ['Ctrl+1'], ['Cmd+1']],
  ['tab.activate:8', 'Go to tab 8', ['Ctrl+8'], ['Cmd+8']],
  ['tab.activate:last', 'Go to last tab', ['Ctrl+9'], ['Cmd+9']],
  ['tab.close', 'Close tab', ['Ctrl+W'], ['Cmd+W']],
  ['tab.close-many:others', 'Close other tabs', [], []],
  ['tab.close-many:connection', 'Close tabs of this connection', [], []],
  ['tab.close-many:all', 'Close all tabs', [], []],
  ['tab.reopen', 'Reopen closed tab', ['Ctrl+Shift+T'], ['Cmd+Shift+T']],
  ['tab.reorder:left', 'Move tab left', ['Ctrl+Shift+PageUp'], ['Cmd+Shift+Option+Left']],
  ['tab.reorder:right', 'Move tab right', ['Ctrl+Shift+PageDown'], ['Cmd+Shift+Option+Right']],
  ['window.zoom:in', 'Zoom in', ['Ctrl+=', 'Ctrl++'], ['Cmd+=', 'Cmd++']],
  ['window.zoom:out', 'Zoom out', ['Ctrl+-'], ['Cmd+-']],
  ['window.zoom:reset', 'Reset zoom', ['Ctrl+0'], ['Cmd+0']],
  ['window.full-screen', 'Enter full screen', ['F11'], ['Ctrl+Cmd+F']],
  ['window.theme:system', 'Theme: follow the system', [], []],
  ['window.theme:dark', 'Theme: dark', [], []],
  ['window.theme:light', 'Theme: light', [], []],
  ['window.size:minimize', 'Minimize window', [], []],
  ['window.size:maximize', 'Maximize window', [], []],
  ['window.size:restore', 'Restore window', [], []],
  ['window.close', 'Close window', [], []],
  ['window.quit', 'Quit Datardo', ['Ctrl+Q'], ['Cmd+Q']],
  ['window.about', 'About Datardo', [], []],
  ['window.open-data-folder', 'Open data folder', [], []],
];

function press(key: string, more: Partial<KeyPress> = {}): KeyPress {
  return { key, ctrl: false, shift: false, alt: false, meta: false, ...more };
}

const nothingOpen = { dialog: false, goTo: false, registered: registeredCommands };
const anywhere: Focus = { typing: 'none' };
const queryBar: Focus = { typing: 'editor' };

describe('palette.commands', () => {
  it('every command of the table is listed with exactly that title and those keys, on each platform', () => {
    const state = harness().state();
    const onWindows = new Map(commands(registeredCommands, 'windows', state).map((entry) => [entry.id, entry]));
    const onMac = new Map(commands(registeredCommands, 'macos', state).map((entry) => [entry.id, entry]));
    for (const [id, title, keys, macKeys] of table) {
      expect(onWindows.get(id as never), id).toMatchObject({ title, keys });
      expect(onMac.get(id as never)?.keys, id).toEqual(macKeys);
    }
  });

  it('> in Go to lists every command of every area by title, each with its key when it has one', () => {
    const state = harness().state();
    const listed = commands(registeredCommands, 'windows', state);
    expect(listed.map((entry) => entry.id)).toEqual(registeredCommands.map((command) => command.id));
    expect(listed.find((entry) => entry.id === 'palette.open')?.shownKey).toBe('Ctrl+K');
  });

  it('no two rows of the list have the same title, and no two the same key', () => {
    const listed = commands(registeredCommands, 'windows', harness().state());
    const titles = listed.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
    const keys = listed.flatMap((entry) => entry.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('with the explorer shown the list has Hide explorer and not Show explorer', () => {
    const titles = commands(registeredCommands, 'windows', harness().state()).map((entry) => entry.title);
    expect(titles).toContain('Hide explorer');
    expect(titles).not.toContain('Show explorer');
  });

  it('on macOS, Go to… is shown with the sign of Cmd and K, and Next tab with the sign of Ctrl and Tab', () => {
    const listed = commands(registeredCommands, 'macos', harness().state());
    expect(listed.find((entry) => entry.id === 'palette.open')?.shownKey).toBe('⌘K');
    expect(listed.find((entry) => entry.id === 'tab.activate:next')?.shownKey).toBe('⌃Tab');
  });

  it('Ctrl+C in a table copies, as its own feature says, and starts no command of the window', () => {
    expect(commandFor(press('c', { ctrl: true }), anywhere, nothingOpen, 'windows')).toEqual({ kind: 'none' });
  });
});

describe('palette.run-command', () => {
  it('with a Redis connection current, > lists no command of a MongoDB area, and those of the window, the tabs and Home', () => {
    const h = harness();
    h.connect(cacheLocal.id);
    h.makeCurrent(cacheLocal.id);
    const ids = offeredCommands(registeredCommands, h.state(), 'windows').map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['window.zoom:in', 'tab.activate:next', 'home.show', 'palette.open']));
    expect(ids.some((id) => /^(query|document|index|monitor)\./u.test(id))).toBe(false);
  });

  it('with no connection current, >index lists nothing', () => {
    const ids = offeredCommands(registeredCommands, harness().state(), 'windows').map((entry) => entry.id);
    expect(ids.filter((id) => id.includes('index'))).toEqual([]);
  });

  it('Refresh the tree and Filter the tree are offered while a connection is current, for both engines', () => {
    const h = harness();
    const treeIds = () =>
      offeredCommands(registeredCommands, h.state(), 'windows')
        .map((entry) => entry.id)
        .filter((id) => id.startsWith('tree.'));
    expect(treeIds()).toEqual([]);
    h.connect(cacheLocal.id);
    h.makeCurrent(cacheLocal.id);
    expect(treeIds()).toEqual(['tree.refresh', 'tree.filter']);
  });

  it('a command not offered now is not listed, and its key does nothing', () => {
    const h = harness();
    expect(intentOf(h.state(), 'nav.back:back')).toBeUndefined();
    expect(intentOf(h.state(), 'window.zoom:reset')).toBeUndefined();
  });

  it('a command is started on what the user is looking at: the active tab', async () => {
    const h = harness();
    h.connect(local.id);
    await h.open(orders);
    expect(intentOf(h.state(), 'tab.close')).toMatchObject({
      feature: 'tab.close',
      target: { kind: 'collection', connection: local.id, database: 'shop', collection: 'orders' },
    });
    expect(intentOf(h.state(), 'window.zoom:in')).toMatchObject({ feature: 'window.zoom', args: 'in' });
  });

  it('offers the commands of the document area on a collection tab, and Save document on an unsaved document tab', async () => {
    const h = harness();
    h.connect(local.id);
    h.makeCurrent(local.id);
    const documentIds = () =>
      offeredCommands(registeredCommands, h.state(), 'windows')
        .map((entry) => entry.id)
        .filter((id) => id.startsWith('document.'));
    expect(documentIds()).toEqual([]);
    await h.open(orders);
    expect(documentIds()).toEqual([
      'document.inspect',
      'document.open',
      'document.inline-edit',
      'document.insert',
      'document.duplicate',
      'document.delete',
      'document.update-many',
      'document.delete-many',
    ]);
    await h.open({ kind: 'document', connection: local.id, database: 'shop', collection: 'orders', id: '7' });
    expect(documentIds()).toEqual([]);
    const tab = h.state().tabs.active;
    if (tab === undefined) {
      throw new Error('Expected the document tab');
    }
    h.holder.dispatch({ slice: 'tabs', type: 'changed', tab, unsaved: true, draft: { text: '{ _id: 7 }' } });
    expect(documentIds()).toEqual(['document.save']);
  });

  it('is one app step that starts the command, with the title of the command', () => {
    const outcome = runCommand.plan(contextOf(harness().state(), 'palette.run-command'), {
      args: { command: 'window.zoom:in' },
    });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: { title: 'Zoom in', steps: [{ text: 'run the command Zoom in', action: 'palette.run-command' }] },
    });
  });

  it('holding Ctrl+W down closes one tab, not all; holding Ctrl+Tab down keeps moving through the tabs', () => {
    expect(isRepeated('tab.close')).toBe(false);
    for (const id of ['tab.activate:next', 'tab.activate:previous', 'nav.back:back', 'nav.back:forward']) {
      expect(isRepeated(id)).toBe(true);
    }
    expect(isRepeated('window.zoom:in') && isRepeated('window.zoom:out')).toBe(true);
  });
});

describe('palette.key-press', () => {
  it('each worked example gives exactly that result', () => {
    const ctrl = { ctrl: true };
    expect(commandFor(press('k', ctrl), { typing: 'none' }, nothingOpen, 'windows')).toEqual({
      kind: 'command',
      command: 'palette.open',
      of: 'window',
    });
    expect(commandFor(press('k', ctrl), anywhere, { ...nothingOpen, goTo: true }, 'windows')).toEqual({
      kind: 'close-go-to',
    });
    expect(commandFor(press('w', ctrl), anywhere, { ...nothingOpen, dialog: true }, 'windows')).toEqual({
      kind: 'none',
    });
    expect(commandFor(press('ArrowLeft', { alt: true }), { typing: 'editor' }, nothingOpen, 'windows')).toMatchObject({
      command: 'nav.back:back',
    });
    expect(commandFor(press('b', ctrl), queryBar, nothingOpen, 'windows')).toMatchObject({
      command: 'nav.toggle-explorer',
    });
    expect(commandFor(press('z', ctrl), queryBar, nothingOpen, 'windows')).toEqual({ kind: 'none' });
    expect(commandFor(press('Delete'), { place: 'tab-strip', typing: 'none' }, nothingOpen, 'windows')).toEqual({
      kind: 'command',
      command: 'tab.close',
      of: 'place',
    });
    expect(commandFor(press('Delete'), queryBar, nothingOpen, 'windows')).toEqual({ kind: 'none' });
    expect(commandFor(press('[', { meta: true }), anywhere, nothingOpen, 'macos')).toMatchObject({
      command: 'nav.back:back',
    });
    expect(commandFor(press('F6'), anywhere, { ...nothingOpen, goTo: true }, 'windows')).toEqual({ kind: 'none' });
  });

  it('Ctrl+Shift+T reopens the last closed tab with the focus in an editor, in a table, in the tree or on the rail', () => {
    for (const focus of [
      { typing: 'editor' },
      { typing: 'none' },
      { place: 'tree', typing: 'none' },
      { place: 'rail', typing: 'none' },
    ] as const) {
      expect(commandFor(press('T', { ctrl: true, shift: true }), focus, nothingOpen, 'windows')).toMatchObject({
        command: 'tab.reopen',
      });
    }
  });

  it('with a form open, no key of the table does anything outside the form', () => {
    for (const key of ['k', 'w', 'b', 'q']) {
      expect(commandFor(press(key, { ctrl: true }), anywhere, { ...nothingOpen, dialog: true }, 'windows')).toEqual({
        kind: 'none',
      });
    }
  });

  it('typing b in the query bar types b; Ctrl+B there hides the explorer', () => {
    expect(commandFor(press('b'), queryBar, nothingOpen, 'windows')).toEqual({ kind: 'none' });
    expect(commandFor(press('b', { ctrl: true }), queryBar, nothingOpen, 'windows')).toMatchObject({
      command: 'nav.toggle-explorer',
    });
  });

  it('on macOS Ctrl+Tab goes to the next tab and Cmd+Tab is left to the system', () => {
    expect(commandFor(press('Tab', { ctrl: true }), anywhere, nothingOpen, 'macos')).toMatchObject({
      command: 'tab.activate:next',
    });
    expect(commandFor(press('Tab', { meta: true }), anywhere, nothingOpen, 'macos')).toEqual({ kind: 'none' });
  });

  it('one key press starts at most one command: + and = are one key, so Ctrl++ and Ctrl+= both zoom in', () => {
    expect(commandFor(press('+', { ctrl: true, shift: true }), anywhere, nothingOpen, 'windows')).toMatchObject({
      command: 'window.zoom:in',
    });
    expect(commandFor(press('=', { ctrl: true }), anywhere, nothingOpen, 'windows')).toMatchObject({
      command: 'window.zoom:in',
    });
  });
});
