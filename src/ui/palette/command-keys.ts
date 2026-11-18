/**
 * The keys of every command, in one place (`palette.key-press`, `palette.commands`): one listener reads each key press
 * once, asks `commandFor` what it does given where the focus is and what is open, and runs that command. A key held
 * down acts once, except for the commands that repeat (`palette.run-command`).
 */
import { useEffect, useRef } from 'react';
import { commands as registeredCommands } from '../../features/commands';
import { commandFor, type Focus, type KeyPress } from '../../features/palette/key-press';
import { isRepeated } from '../../features/palette/run-command';
import type { Place } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { isDialogOpen } from '../shell/focus';
import { useAppState } from '../state/store';
import { closeGoTo, isGoToOpen } from './go-to-store';
import { runCommand, setSwitcherOpener } from './run-command';

/** The key pressed, as `palette.key-press` reads it. */
export function pressOf(event: KeyboardEvent): KeyPress {
  return { key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
}

/** Where the focus is: the place of its control, and whether it is in an editor or a text field. */
export function focusOf(element: Element | null): Focus {
  const place: Place | undefined =
    element?.closest('[role="tablist"]') === null || element === null ? undefined : 'tab-strip';
  const editor = element?.closest('.cm-editor, .monaco-editor') !== null && element !== null;
  const field =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable);
  return { ...(place === undefined ? {} : { place }), typing: editor ? 'editor' : field ? 'text-field' : 'none' };
}

/** Takes the keys of every command while the window is open. */
export function useCommandKeys(openSwitcher: () => void): void {
  const state = useAppState();
  const latest = useRef<AppState>(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    setSwitcherOpener(openSwitcher);
    return () => {
      setSwitcherOpener(undefined);
    };
  }, [openSwitcher]);
  useEffect(() => {
    const press = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      const now = latest.current;
      const outcome = commandFor(
        pressOf(event),
        focusOf(document.activeElement),
        { dialog: isDialogOpen(), goTo: isGoToOpen(), registered: registeredCommands },
        now.app.platform,
      );
      if (outcome.kind === 'close-go-to') {
        event.preventDefault();
        closeGoTo();
      } else if (outcome.kind === 'command' && outcome.of === 'window') {
        event.preventDefault();
        if (!event.repeat || isRepeated(outcome.command)) {
          runCommand(outcome.command, now);
        }
      }
    };
    window.addEventListener('keydown', press);
    return () => {
      window.removeEventListener('keydown', press);
    };
  }, []);
}
