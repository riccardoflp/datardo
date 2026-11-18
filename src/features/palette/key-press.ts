/**
 * Feature: palette.key-press
 *
 * Decides what a key does, given where the focus is: the command it starts, or none, in which case the key goes to the
 * control that has the focus. One key press starts at most one command, and a key that types a character in a text
 * field never starts a command of the window. The keys are those of `palette.commands`.
 */
import type { Platform } from '../../shared/feature';
import type { Place } from '../../shared/ids';
import type { Command, CommandId } from '../command';
import { keysOf } from './commands';

/** A key pressed, with its modifiers, as the window reads it (`KeyboardEvent.key`). */
export interface KeyPress {
  readonly key: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /** `Cmd` on macOS, the key with the system's logo elsewhere. */
  readonly meta: boolean;
}

/** Where the focus is: a place, and whether it is in an editor or a text field. */
export interface Focus {
  readonly place?: Place;
  readonly typing: 'editor' | 'text-field' | 'none';
}

/** What is open over the window. */
export interface Opened {
  /** A dialog (`nav.dialog`): a question, a confirmation, a form. */
  readonly dialog: boolean;
  /** Go to's list. */
  readonly goTo: boolean;
}

/** What a key does. */
export type KeyOutcome =
  /** Starts a command: a key of the window, or of the place that has the focus. */
  | { readonly kind: 'command'; readonly command: CommandId; readonly of: 'window' | 'place' }
  /** `Ctrl+K` or `Esc` while Go to is open. */
  | { readonly kind: 'close-go-to' }
  /** Nothing: the key goes to the control that has the focus. */
  | { readonly kind: 'none' };

/** A key as the cards write it, read into what a key press must have. */
interface Chord {
  readonly key: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/** A key of a place, which works while the focus is in that place; the place's own control carries it out. */
export interface PlaceKey {
  readonly place: Place;
  readonly key: string;
  readonly command: CommandId;
}

/** The keys of places that start a command (the cards of each place say so). */
export const placeKeys: readonly PlaceKey[] = [
  { place: 'tab-strip', key: 'Delete', command: 'tab.close' as CommandId },
];

/** The names the cards give keys, as `KeyboardEvent.key` writes them. */
const keyNames: Readonly<Record<string, string>> = {
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  esc: 'escape',
};

/** Reads `Ctrl+Shift+T`, `Cmd+[` or `Ctrl++` into its parts; `Option` is `Alt`, `Cmd` is the meta key. */
export function chordOf(written: string): Chord {
  const parts = written.split(/\+(?=.)/u);
  const last = (parts.pop() ?? '').toLowerCase();
  return {
    key: keyNames[last] ?? last,
    ctrl: parts.includes('Ctrl'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt') || parts.includes('Option'),
    meta: parts.includes('Cmd'),
  };
}

/** `+` and `=` share a key, so `Shift` is free on them; other keys need their modifiers exactly. */
function isPressed(press: KeyPress, chord: Chord): boolean {
  const key = press.key.toLowerCase();
  const shiftFree = chord.key === '+' || chord.key === '=';
  return (
    key === chord.key &&
    press.ctrl === chord.ctrl &&
    press.alt === chord.alt &&
    press.meta === chord.meta &&
    (shiftFree || press.shift === chord.shift)
  );
}

/** Every key of the window, with its command, for a platform. */
export function windowKeys(
  registered: readonly Command[],
  platform: Platform,
): readonly { readonly chord: Chord; readonly command: CommandId }[] {
  return registered.flatMap((command) =>
    keysOf(command, platform).map((key) => ({ chord: chordOf(key), command: command.id })),
  );
}

/** What the inputs of {@link commandFor} come with: the commands that have keys. */
export interface KeyTable {
  readonly registered: readonly Command[];
}

/**
 * The command a key starts, given where the focus is and what is open, in the order of the card's rules: a dialog
 * takes every key; Go to takes every key but `Ctrl+K` and `Esc`, which close it; then the key of the place that has
 * the focus; then the key of the window, wherever the focus is.
 */
export function commandFor(press: KeyPress, focus: Focus, state: Opened & KeyTable, platform: Platform): KeyOutcome {
  if (state.dialog) {
    return { kind: 'none' };
  }
  const windowKey = windowKeys(state.registered, platform).find((each) => isPressed(press, each.chord));
  if (state.goTo) {
    const closes = press.key === 'Escape' || windowKey?.command === 'palette.open';
    return closes ? { kind: 'close-go-to' } : { kind: 'none' };
  }
  const placeKey = placeKeys.find(
    (each) => each.place === focus.place && focus.typing === 'none' && isPressed(press, chordOf(each.key)),
  );
  if (placeKey !== undefined) {
    return { kind: 'command', command: placeKey.command, of: 'place' };
  }
  return windowKey === undefined ? { kind: 'none' } : { kind: 'command', command: windowKey.command, of: 'window' };
}
