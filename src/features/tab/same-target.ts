/**
 * Feature: tab.same-target
 *
 * Says whether something asked to be opened is already open: two things are the same when their keys are equal. The
 * key never holds a secret, the text of a query or a value.
 */
import type { Platform } from '../../shared/feature';
import type { TabShows } from '../../shared/state/tabs';
import { hexOfText } from '../nav/pin';

/** Whether paths are compared without regard to case: on Windows and macOS. */
function isCaseFolded(platform: Platform): boolean {
  return platform === 'windows' || platform === 'macos';
}

/** A number written as text, as one value whatever its type: `7`, `7.0` and `7e0` are `7`. */
export function numberValue(written: string): string {
  const parts = /^([+-]?)(\d*)(?:\.(\d*))?$/u.exec(written.trim());
  if (parts === null) {
    const value = Number(written);
    return Number.isNaN(value) ? 'NaN' : String(value);
  }
  const whole = (parts[2] ?? '').replace(/^0+(?=\d)/u, '') || '0';
  const fraction = (parts[3] ?? '').replace(/0+$/u, '');
  const digits = fraction === '' ? whole : `${whole}.${fraction}`;
  return digits === '0' || parts[1] !== '-' ? digits : `-${digits}`;
}

const numberWrappers = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'];

/** The value of an `_id` as canonical Extended JSON, with numbers compared by value whatever their type. */
function idValue(json: unknown): string {
  if (typeof json === 'number') {
    return `number:${numberValue(String(json))}`;
  }
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    const entries = Object.entries(json as Record<string, unknown>);
    const [only] = entries;
    if (entries.length === 1 && only !== undefined && numberWrappers.includes(only[0]) && typeof only[1] === 'string') {
      return `number:${numberValue(only[1])}`;
    }
  }
  return `value:${JSON.stringify(json)}`;
}

/** The key of an `_id`: from its Extended JSON when it is known, else from its text as the table shows it. */
function idKey(shows: Extract<TabShows, { kind: 'document' }>): string {
  if (shows.idJson === undefined) {
    return `text:${shows.id}`;
  }
  try {
    return idValue(JSON.parse(shows.idJson));
  } catch {
    // Not JSON: the text itself is the best identity there is, and the tab stays one of its own.
    return `text:${shows.idJson}`;
  }
}

function playgroundKey(shows: Extract<TabShows, { kind: 'playground' }>, platform: Platform): string {
  if (shows.file === undefined) {
    // Never saved: the same as nothing, so its key is its own (its title is the only one of its group).
    return `playground:unsaved:${JSON.stringify([shows.connection, shows.title])}`;
  }
  const path = platform === 'windows' ? shows.file.replace(/\//gu, '\\') : shows.file;
  return `playground:${isCaseFolded(platform) ? path.toLowerCase() : path}`;
}

/**
 * Feature: tab.same-target
 *
 * The key of what a tab shows. A tab of the app is `page:settings`; the others are the kind and what tells them apart,
 * the connection by its identity.
 */
export function targetKey(target: TabShows, platform: Platform = 'linux'): string {
  switch (target.kind) {
    case 'app':
      if (target.edits !== undefined) {
        return `page:${target.page}:${target.edits}`;
      }
      return target.engine === undefined ? `page:${target.page}` : `page:${target.page}:new:${target.engine}`;
    case 'collection':
      return `collection:${JSON.stringify([target.connection, target.database, target.collection])}`;
    case 'document':
      return `document:${JSON.stringify([target.connection, target.database, target.collection, idKey(target)])}`;
    case 'keys':
      return `keys:${JSON.stringify([target.connection, target.database, target.namespace ?? ''])}`;
    case 'key':
      return `key:${JSON.stringify([target.connection, target.database, target.keyHex ?? hexOfText(target.key)])}`;
    case 'playground':
      return playgroundKey(target, platform);
    case 'console':
      return `console:${JSON.stringify([target.connection])}`;
    case 'page':
      return `connection-page:${JSON.stringify([target.connection, target.page, target.database ?? null, ...(target.of ?? [])])}`;
  }
}
