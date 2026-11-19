/**
 * Feature: manage.name-rules
 *
 * The names of databases and collections Datardo refuses while they are typed, before asking MongoDB, whose messages
 * say less. The rules are checked in order, and the first that fails decides; the checks against existing names come
 * after them, in the features that use them.
 */
import type { TextRule } from '../../shared/question';
import { text } from './text';

/** What a name is of. */
export type NameKind = 'database' | 'collection';

/** The longest name of a database, in bytes of UTF-8. */
export const longestDatabaseName = 63;

const databaseCharacters = /[ /\\."$*<>:|?]/u;

/** The NUL character, refused in every name. */
const nul = '\u0000';

function databaseError(name: string): string | undefined {
  if (databaseCharacters.test(name) || name.includes(nul)) {
    return text.names.databaseCharacters;
  }
  return new TextEncoder().encode(name).length > longestDatabaseName ? text.names.databaseLength : undefined;
}

function collectionError(name: string): string | undefined {
  if (name.includes('$') || name.includes(nul)) {
    return text.names.collectionDollar;
  }
  if (name.startsWith('system.')) {
    return text.names.collectionSystem;
  }
  return name.startsWith('.') || name.endsWith('.') ? text.names.collectionDot : undefined;
}

/** Feature: manage.name-rules — the message shown under the field for `name`, trimmed; `undefined` when it is valid. */
export function nameError(kind: NameKind, name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') {
    return text.names.empty;
  }
  return kind === 'database' ? databaseError(trimmed) : collectionError(trimmed);
}

/**
 * The rules of a field that takes a name, as the dialog checks them while typing: those a pattern can say, in the
 * order of {@link nameError}. The length in bytes is checked by {@link nameError} when the form is answered.
 */
export function nameRules(kind: NameKind): readonly TextRule[] {
  const empty: TextRule = { kind: 'not-empty', message: text.names.empty };
  if (kind === 'database') {
    return [
      empty,
      { kind: 'pattern', pattern: '^\\s*[^ /\\\\."$*<>:|?\\u0000]*\\s*$', message: text.names.databaseCharacters },
    ];
  }
  return [
    empty,
    { kind: 'pattern', pattern: '^[^$\\u0000]*$', message: text.names.collectionDollar },
    { kind: 'pattern', pattern: '^(?!\\s*system\\.)', message: text.names.collectionSystem },
    { kind: 'pattern', pattern: '^\\s*(?!\\.)(?:.*[^.\\s])?\\s*$', message: text.names.collectionDot },
  ];
}
