import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/window/top-bar';
import { featureId, type QuestionId } from '../../../src/shared/ids';
import { stateWith } from './context';

describe('window.top-bar', () => {
  it('is 40 px high and names its controls Go to and MCP server', () => {
    const bar = view(stateWith());
    expect(bar.height).toBe(40);
    expect(bar.name).toBe('Datardo');
    expect(bar.goTo).toMatchObject({
      label: 'Go to',
      placeholder: 'Go to a collection, a key, a page or a command',
      key: 'Ctrl+K',
      element: 'palette.open@top-bar',
      enabled: true,
    });
    expect(bar.goTo.intent.feature).toBe('palette.open');
    expect(bar.mcp).toMatchObject({ text: 'MCP', label: 'MCP server', element: 'mcp.setup@top-bar' });
  });

  it("on Windows has no buttons of its own and leaves the system's 138 px at the right", () => {
    const bar = view(stateWith({ platform: 'windows' }));
    expect(bar.buttons).toEqual([]);
    expect(bar.room).toEqual({ left: 0, right: 138 });
  });

  it("at 150% leaves the system's buttons the same room on the screen", () => {
    const bar = view(stateWith({ platform: 'windows', settings: { 'datardo.window.zoom': 150 } }));
    expect(bar.room.right * 1.5).toBe(138);
  });

  it('on macOS leaves 78 px at the left', () => {
    expect(view(stateWith({ platform: 'macos' })).room).toEqual({ left: 78, right: 0 });
  });

  it('on Linux ends with Minimize, Maximize and Close; Restore while maximized', () => {
    const names = (maximized: boolean): string[] =>
      view(stateWith({ platform: 'linux', window: { maximized } })).buttons.map((button) => button.name);
    expect(names(false)).toEqual(['Minimize', 'Maximize', 'Close']);
    expect(names(true)).toEqual(['Minimize', 'Restore', 'Close']);
    const close = view(stateWith({ platform: 'linux' })).buttons[2];
    expect(close).toMatchObject({ element: 'window.close@top-bar' });
    expect(close?.intent.feature).toBe('window.close');
  });

  it('on Linux, in full screen, ends with the single button Exit full screen', () => {
    const bar = view(stateWith({ platform: 'linux', window: { fullScreen: true } }));
    expect(bar.buttons.map((button) => [button.name, button.element])).toEqual([
      ['Exit full screen', 'window.full-screen@top-bar'],
    ]);
  });

  it('while a dialog is open, the Go to field and the MCP state do not answer', () => {
    const dialog = {
      kind: 'question' as const,
      id: 'd1' as QuestionId,
      feature: featureId('connection.add'),
      question: { title: 'Add', button: 'Add', fields: [] },
    };
    const bar = view(stateWith({ runner: { dialogs: [dialog] } }));
    expect(bar.goTo.enabled).toBe(false);
    expect(bar.mcp.enabled).toBe(false);
  });
});
