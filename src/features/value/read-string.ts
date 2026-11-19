/**
 * Feature: value.read-string — reads the bytes of a string: whole with `GET` when it is small, a part of 1 MB at a time
 * with `GETRANGE` when it is large, and its first 4 KB in the compact form. Each part is sent with `STRLEN` again, so
 * that a value that changed while it was read is read again from the start.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { readText } from './text';
import { engineRead, fieldsOf, keyOf, replyBytes, replyNumber, withoutCutCharacter, type Word } from './types';

/** A part of a large string is 1,048,576 bytes (Datardo's choice); a string up to that is read with `GET`. */
export const partSize = 1_048_576;

/** Strings of up to 16,777,216 bytes can be loaded whole and edited (Datardo's choice). */
export const editLimit = 16_777_216;

/** The compact form shows the first 4,096 bytes (Datardo's choice). */
export const compactLength = 4096;

/** What a read of a string is started with. */
export interface StringArgs {
  readonly form: 'full' | 'compact';
  /** The length read first, once known: absent for the very first read, which asks `STRLEN` alone. */
  readonly length?: number;
  /** Where the part starts; 0 for the first. */
  readonly offset?: number;
}

/** The arguments of a read, from JSON. */
export function stringArgs(args: Json): StringArgs {
  const fields = fieldsOf(args);
  const length = fields['length'];
  const offset = fields['offset'];
  return {
    form: fields['form'] === 'compact' ? 'compact' : 'full',
    ...(typeof length === 'number' ? { length } : {}),
    ...(typeof offset === 'number' ? { offset } : {}),
  };
}

/** The commands of a read: `STRLEN`, then `GET`, `GETRANGE <key> <offset> <offset + 1 MB - 1>` or `GETRANGE <key> 0 4095`. */
export function stringCommands(key: Uint8Array, asked: StringArgs): readonly (readonly Word[])[] {
  const length: readonly Word[] = ['STRLEN', key];
  if (asked.form === 'compact') {
    return [length, ['GETRANGE', key, '0', String(compactLength - 1)]];
  }
  if (asked.length === undefined) {
    return [length];
  }
  const offset = asked.offset ?? 0;
  if (offset === 0 && asked.length <= partSize) {
    return [length, ['GET', key]];
  }
  return [length, ['GETRANGE', key, String(offset), String(offset + partSize - 1)]];
}

/** Feature: value.read-string — the commands of the part asked by `args` (`StringArgs`). */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  return engineRead(at, stringCommands(at.key, stringArgs(args)));
}

/** A part of a string as read: the length now, where the part starts, its bytes, and whether the length changed. */
export interface StringPart {
  readonly length: number;
  readonly offset: number;
  readonly bytes?: Uint8Array;
  /** The length is no longer the one read first: the value is read again from the start. */
  readonly changed: boolean;
}

/** Feature: value.read-string — the length and the bytes of the part. */
export function parse(replies: readonly unknown[], args: Json = null): StringPart {
  const asked = stringArgs(args);
  const length = replyNumber(replies[0]) ?? 0;
  const bytes = replies.length > 1 ? (replyBytes(replies[1]) ?? new Uint8Array()) : undefined;
  return {
    length,
    offset: asked.offset ?? 0,
    ...(bytes === undefined ? {} : { bytes }),
    changed: asked.form === 'full' && asked.length !== undefined && asked.length !== length,
  };
}

/** A string as loaded so far. */
export interface StringLoad {
  readonly length: number;
  readonly loaded: Uint8Array;
}

/** Whether every byte is loaded. */
export function isWhole(load: StringLoad): boolean {
  return load.loaded.length >= load.length;
}

/** Whether **Load the whole value** is offered: up to 16 MB. */
export function canLoadWhole(load: StringLoad): boolean {
  return !isWhole(load) && load.length <= editLimit;
}

/** Whether the editor can be typed in: the value is whole and at most 16 MB. */
export function isEditable(load: StringLoad): boolean {
  return isWhole(load) && load.length <= editLimit;
}

/** The arguments of **Load more**: the next part; undefined when the value is whole. */
export function nextPart(load: StringLoad): StringArgs | undefined {
  return isWhole(load) ? undefined : { form: 'full', length: load.length, offset: load.loaded.length };
}

/** The load after a part: the part added, or the value from the start when its length changed. */
export function withPart(load: StringLoad, part: StringPart): StringLoad {
  const bytes = part.bytes ?? new Uint8Array();
  if (part.changed || part.offset === 0) {
    return { length: part.length, loaded: bytes };
  }
  const loaded = new Uint8Array(load.loaded.length + bytes.length);
  loaded.set(load.loaded);
  loaded.set(bytes, load.loaded.length);
  return { length: part.length, loaded };
}

/** The bytes the format is decided on: without the bytes of a character that the end of a part cuts. */
export function bytesShown(load: StringLoad): Uint8Array {
  return isWhole(load) ? load.loaded : withoutCutCharacter(load.loaded);
}

/** A size as the notes write it: `1 MB`, `12.4 MB`, `4 KB`, `512 bytes`. */
export function sizeText(bytes: number): string {
  const units: readonly (readonly [number, string])[] = [
    [1_073_741_824, 'GB'],
    [1_048_576, 'MB'],
    [1024, 'KB'],
  ];
  const unit = units.find(([size]) => bytes >= size);
  if (unit === undefined) {
    return `${String(bytes)} bytes`;
  }
  const value = Math.round((bytes / unit[0]) * 10) / 10;
  return `${String(value)} ${unit[1]}`;
}

/** What the view says under the value: how much is shown, and why it cannot be edited; nothing for a whole value. */
export function stringNote(load: StringLoad, form: 'full' | 'compact'): string | undefined {
  if (form === 'compact') {
    return isWhole(load) ? undefined : readText.firstOfCompact(sizeText(load.loaded.length), sizeText(load.length));
  }
  if (load.length > editLimit) {
    return readText.tooLargeToEdit(sizeText(load.length));
  }
  return isWhole(load) ? undefined : readText.firstPartOf(sizeText(load.loaded.length), sizeText(load.length));
}
