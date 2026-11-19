/**
 * Feature: key.inspect
 *
 * Shows the selected key in the inspector island: what it is, when it expires, how much it takes, and its value in
 * short. 150 ms after the selection settles, one pipeline reads `TYPE`, `PTTL`, `MEMORY USAGE` and `OBJECT ENCODING`
 * (`key.inspect:read`); the value is `value.show`'s, in its compact form.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { sizeText } from '../connection/overview';
import { joinedExpiryText } from './format-expiry';
import { scanCall } from './scan';
import { text } from './text';
import type { KeyName, KeyType } from './types';
import { isErrorReply, isKnownType, keyOfArgs, nameText, numberOf, typeLabel, wordOf } from './types';

/** The identifier of the read of the island. */
export const inspectReadId = 'key.inspect:read';

/** What the island read of a key; a line the server refused is `refused`. */
export interface InspectedKey {
  readonly type: KeyType;
  /** The time left in ms; `null` for a persistent key. */
  readonly timeLeft: number | null;
  readonly size: number | 'refused';
  /** What `OBJECT ENCODING` answered (`listpack`); absent when the server refused it. */
  readonly encoding?: string;
}

/** What the island has of the key: reading, gone, read, or the server's error. */
export type InspectRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'loaded'; readonly key: InspectedKey; readonly readAt: number }
  | { readonly kind: 'failed'; readonly error: string };

/** What the island is drawn from. */
export interface InspectState {
  readonly name: KeyName;
  readonly readOnly: boolean;
  readonly read: InspectRead;
  /** The clock, counted again every second. */
  readonly now: number;
}

/** A button of the island, with the identifier of its control. */
export interface InspectButton {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** A line of the island: a label, its value, a tooltip, and the buttons beside it. */
export interface InspectLine {
  readonly label: string;
  readonly value: string;
  readonly tooltip?: string;
  readonly buttons?: readonly InspectButton[];
}

/** What the island shows. */
export interface InspectView {
  readonly name: string;
  readonly copyName: InspectButton;
  /** The text of a key that is gone, and nothing else. */
  readonly message?: string;
  readonly loading?: boolean;
  readonly lines: readonly InspectLine[];
  /** The value: `value.show` compact, or the line of a key of a module's type. */
  readonly value?: { readonly kind: 'value' } | { readonly kind: 'module'; readonly text: string };
  readonly buttons: readonly InspectButton[];
}

const button = (label: string, feature: string, element: string): InspectButton => ({ label, feature, element });

function writeButtons(readOnly: boolean): readonly InspectButton[] {
  const open = button(text.inspect.open, 'key.open', 'key.open@inspector');
  return readOnly
    ? [open]
    : [
        open,
        button(text.inspect.rename, 'key.rename', 'key.rename@inspector'),
        button(text.inspect.copy, 'key.copy', 'key.copy@inspector'),
        button(text.inspect.delete, 'key.delete', 'key.delete@inspector'),
      ];
}

function expiryLine(key: InspectedKey, readAt: number, state: InspectState): InspectLine {
  const expiresAt = key.timeLeft === null ? undefined : readAt + key.timeLeft;
  const buttons = state.readOnly
    ? []
    : [
        button(text.inspect.setExpiry, 'key.set-expiry', 'key.set-expiry@inspector'),
        ...(expiresAt === undefined ? [] : [button(text.inspect.persist, 'key.persist', 'key.persist@inspector')]),
      ];
  return {
    label: text.inspect.expiry,
    value: joinedExpiryText(expiresAt, state.now),
    ...(buttons.length === 0 ? {} : { buttons }),
  };
}

function loadedLines(key: InspectedKey, readAt: number, state: InspectState): readonly InspectLine[] {
  return [
    { label: text.inspect.type, value: typeLabel(key.type) },
    expiryLine(key, readAt, state),
    {
      label: text.inspect.size,
      value: key.size === 'refused' ? text.inspect.refused : sizeText(key.size),
      tooltip: text.inspect.sizeTooltip,
    },
    { label: text.inspect.encoding, value: key.encoding ?? text.inspect.refused },
  ];
}

/** Feature: key.inspect — the island for one selected key, in its states: loading, gone, read, of a module's type. */
export function view(state: InspectState): InspectView {
  const name = nameText(state.name);
  const base = { name, copyName: button(text.inspect.copyName, 'key.copy-name', 'key.copy-name@inspector') };
  switch (state.read.kind) {
    case 'gone':
      return { ...base, message: text.gone(name), lines: [], buttons: [] };
    case 'loading':
      return { ...base, loading: true, lines: [], buttons: writeButtons(state.readOnly) };
    case 'failed':
      return { ...base, message: state.read.error, lines: [], buttons: writeButtons(state.readOnly) };
    case 'loaded': {
      const key = state.read.key;
      return {
        ...base,
        lines: loadedLines(key, state.read.readAt, state),
        value: isKnownType(key.type) ? { kind: 'value' } : { kind: 'module', text: text.moduleValue(key.type) },
        buttons: writeButtons(state.readOnly),
      };
    }
  }
}

/** `key.inspect:read`: one pipeline of `TYPE`, `PTTL`, `MEMORY USAGE` and `OBJECT ENCODING` of the key. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = keyOfArgs(args);
  const call = (words: readonly (string | Uint8Array)[]) => scanCall(asked.connection, asked.database, words);
  return {
    kind: 'engine',
    requests: [
      call(['TYPE', asked.key]),
      call(['PTTL', asked.key]),
      call(['MEMORY', 'USAGE', asked.key]),
      call(['OBJECT', 'ENCODING', asked.key]),
    ],
  };
}

/** `key.inspect:read`: the key's details, or `gone` when `TYPE` answers `none` or `PTTL` `-2`. */
export function parse(replies: readonly unknown[]): InspectedKey | 'gone' {
  const [type, pttl, size, encoding] = replies as readonly RedisReply[];
  const typeName = wordOf(type) ?? 'none';
  const left = numberOf(pttl);
  if (typeName === 'none' || left === -2) {
    return 'gone';
  }
  const bytes = numberOf(size);
  const encodingName = wordOf(encoding);
  return {
    type: typeName,
    timeLeft: left === undefined || left === -1 ? null : left,
    size: bytes === undefined || isErrorReply(size) ? 'refused' : bytes,
    ...(encodingName === undefined ? {} : { encoding: encodingName }),
  };
}

/** `key.inspect:read`, as the runner starts it for the island. */
export const read: ReadFeature = { kind: 'read', id: featureId(inspectReadId), request, parse };
