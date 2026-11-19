/**
 * Where the caret is in a playground's script, for autocomplete (`playground.autocomplete`): after `db.`, a
 * collection, a cursor, `db.getMongo().` or a session, or inside the arguments of which call. A variable counts as
 * what it was last declared to be, through up to three variables. The text is scanned, never run (R9.1). Ported from
 * Mongoster's `src/playground/context.ts` (`scan`, `receiverBefore`, `calleeBefore`, `callAt`, `memberAt`).
 */

/** The call whose arguments hold the caret. */
export interface CallAt {
  /** The collection the call is on; absent for a method of `db`. */
  readonly collection?: string;
  readonly method: string;
  /** For a method of a cursor (`sort`, `project`…): the call that made the cursor (`find`, `aggregate`). */
  readonly cursorOf?: string;
  readonly argumentIndex: number;
  /** Where the argument at the caret starts. */
  readonly argumentStart: number;
  /** The database named by the receiver (`session.getDatabase("x")`, `db.getSiblingDB("x")`), if any. */
  readonly database?: string;
}

/** A member being typed after an object of the runtime. */
export type MemberAt =
  | { readonly kind: 'db'; readonly prefix: string; readonly start: number; readonly database?: string }
  | {
      readonly kind: 'collection';
      readonly collection: string;
      readonly prefix: string;
      readonly start: number;
      readonly database?: string;
    }
  | { readonly kind: 'cursor' | 'mongo' | 'session'; readonly prefix: string; readonly start: number };

interface Frame {
  readonly character: string;
  readonly position: number;
  commas: number;
  lastComma: number;
}

interface Scanned {
  readonly frames: readonly Frame[];
  /** Each closing bracket's position → its opening bracket's. */
  readonly openOf: ReadonlyMap<number, number>;
  /** The caret is inside a string (`"`, `'`, a backtick), a comment (`//`, `/*`) or a regular expression (`/`). */
  readonly literal?: string;
}

const opening: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/** The end of a comment that starts at `index`, or -1 when it reaches past `offset`. */
function commentEnd(text: string, index: number, offset: number): number {
  if (text[index + 1] === '/') {
    const end = text.indexOf('\n', index);
    return end < 0 || end >= offset ? -1 : end + 1;
  }
  const end = text.indexOf('*/', index + 2);
  return end < 0 || end + 2 > offset ? -1 : end + 2;
}

/** The end of a string or a regular expression that starts at `index` with `quote`. */
function literalEnd(text: string, index: number, quote: string): number {
  let end = index + 1;
  while (end < text.length && text[end] !== quote && (quote === '`' || text[end] !== '\n')) {
    end += text[end] === '\\' ? 2 : 1;
  }
  return end;
}

function opensLiteral(character: string, next: string | undefined, previous: string): boolean {
  if (character === '"' || character === "'" || character === '`') {
    return true;
  }
  return (
    character === '/' && next !== '/' && next !== '*' && (previous === '' || /[(,=:[!&|?{};+\-*%<>~^]/u.test(previous))
  );
}

function closeFrame(frames: Frame[], openOf: Map<number, number>, character: string, index: number): void {
  const found = frames.map((frame) => frame.character).lastIndexOf(opening[character] ?? '');
  if (found >= 0) {
    openOf.set(index, frames[found]?.position ?? 0);
    frames.length = found;
  }
}

/** The brackets still open at `offset`, where each bracket closed before it opened, and the literal it is in. */
function scan(text: string, offset: number): Scanned {
  const frames: Frame[] = [];
  const openOf = new Map<number, number>();
  let previous = '';
  let index = 0;
  while (index < offset) {
    const character = text.charAt(index);
    if (character === '/' && (text[index + 1] === '/' || text[index + 1] === '*')) {
      const end = commentEnd(text, index, offset);
      if (end < 0) {
        return { frames, openOf, literal: text.slice(index, index + 2) };
      }
      index = end;
      continue;
    }
    if (opensLiteral(character, text[index + 1], previous)) {
      const end = literalEnd(text, index, character);
      if (end >= offset) {
        return { frames, openOf, literal: character };
      }
      index = end + 1;
      while (character === '/' && /[a-z]/u.test(text.charAt(index))) {
        index += 1;
      }
      previous = 'x';
      continue;
    }
    scanCharacter({ frames, openOf }, character, index);
    previous = /\s/u.test(character) ? previous : character;
    index += 1;
  }
  return { frames, openOf };
}

function scanCharacter(
  state: { frames: Frame[]; openOf: Map<number, number> },
  character: string,
  index: number,
): void {
  if (character === '(' || character === '[' || character === '{') {
    state.frames.push({ character, position: index, commas: 0, lastComma: -1 });
  } else if (character === ')' || character === ']' || character === '}') {
    closeFrame(state.frames, state.openOf, character, index);
  } else if (character === ',') {
    const frame = state.frames[state.frames.length - 1];
    if (frame !== undefined) {
      frame.commas += 1;
      frame.lastComma = index;
    }
  }
}

/** What an expression is, as a receiver of a method. */
interface Receiver {
  readonly collection?: string;
  readonly cursorOf?: string;
  /** On `db` (or a database of a session) or a collection. */
  readonly onDatabase: boolean;
  readonly database?: string;
  /** `db.getMongo()` or a session, which are not databases. */
  readonly object?: 'mongo' | 'session';
}

interface Callee extends Receiver {
  readonly method: string;
}

/** The methods that give a database: `db.getSiblingDB("x")`, `session.getDatabase("x")`, `getMongo().getDB("x")`. */
const databaseMethods = ['getSiblingDB', 'getDatabase', 'getDB'];

/** The string of a call's only argument: `("x")` → `x`. */
function onlyString(argumentsText: string): string | undefined {
  return /^\(\s*(["'`])((?:(?!\1).)+)\1\s*\)$/u.exec(argumentsText)?.[2];
}

/** Where the expression that starts at `from` ends: `;`, a new line or a comma outside brackets and strings. */
function expressionEnd(text: string, from: number): number {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character === '"' || character === "'" || character === '`') {
      index = literalEnd(text, index, character);
    } else if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth < 0) {
        return index;
      }
    } else if (depth === 0 && (character === ';' || character === '\n' || character === ',')) {
      return index;
    }
  }
  return text.length;
}

/** The whole script, and where the text being read starts in it: variables are looked up in the script. */
interface Source {
  readonly script: string;
  readonly at: number;
}

/** The deepest variables are followed: a variable holding a variable holding a variable. */
const deepestVariables = 3;

function escapedName(name: string): string {
  return name.replace(/\$/gu, '\\$');
}

/** What a variable holds, from its last `const`, `let` or `var` before `before`: never a cursor or a document. */
function variableBefore(source: Source, name: string, before: number, depth: number): Receiver | undefined {
  if (depth > deepestVariables) {
    return undefined;
  }
  let start = -1;
  const declared = new RegExp(`\\b(?:const|let|var)\\s+${escapedName(name)}\\s*=\\s*(?:await\\s+)?`, 'gu');
  for (const match of source.script.slice(0, before).matchAll(declared)) {
    start = match.index + match[0].length;
  }
  if (start < 0) {
    return undefined;
  }
  const expression = source.script.slice(start, expressionEnd(source.script, start));
  const read = { text: expression, openOf: scan(expression, expression.length).openOf, depth: depth + 1 };
  const held = receiverBefore(read, expression.length, { script: source.script, at: start });
  return held?.cursorOf === undefined ? held : undefined;
}

function spaceBefore(text: string, index: number): number {
  let at = index;
  while (at > 0 && /\s/u.test(text.charAt(at - 1))) {
    at -= 1;
  }
  return at;
}

/** A text being read, with its brackets and how deep in variables it is. */
interface Reading {
  readonly text: string;
  readonly openOf: ReadonlyMap<number, number>;
  readonly depth: number;
}

/** What a call's result is as a receiver: a database, the connection, a session, a collection or a cursor. */
function calledReceiver(reading: Reading, open: number, end: number, source: Source): Receiver | undefined {
  const inner = calleeBefore(reading, open, source);
  if (inner === undefined) {
    return undefined;
  }
  const isDb = inner.onDatabase && inner.collection === undefined && inner.cursorOf === undefined;
  const fromObject = isDb || inner.object !== undefined;
  const named = onlyString(reading.text.slice(open, end));
  if (databaseMethods.includes(inner.method) && fromObject) {
    return { onDatabase: true, ...(named === undefined ? {} : { database: named }) };
  }
  if (inner.method === 'getMongo' && fromObject) {
    return { onDatabase: false, object: 'mongo' };
  }
  if (inner.method === 'startSession' && inner.object === 'mongo') {
    return { onDatabase: false, object: 'session' };
  }
  if (!inner.onDatabase) {
    return undefined;
  }
  const database = inner.database === undefined ? {} : { database: inner.database };
  if (inner.method === 'getCollection' && isDb) {
    return named === undefined ? undefined : { collection: named, onDatabase: true, ...database };
  }
  // A cursor: find(…).sort(…) remembers where it came from.
  const collection = inner.collection === undefined ? {} : { collection: inner.collection };
  return { ...collection, cursorOf: inner.cursorOf ?? inner.method, onDatabase: true, ...database };
}

const namesBefore = /\b([A-Za-z_$][\w$]*)((?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[\s*(["'])[^"'\n]+\3\s*\])*)$/u;

/** What the receiver that ends at `end` is: a collection, `db`, a cursor, `db.getMongo()`, a session, a variable. */
function receiverBefore(reading: Reading, endAt: number, source: Source): Receiver | undefined {
  const { text } = reading;
  const end = spaceBefore(text, endAt);
  if (text[end - 1] === ')') {
    const open = reading.openOf.get(end - 1);
    return open === undefined ? undefined : calledReceiver(reading, open, end, source);
  }
  const match = namesBefore.exec(text.slice(Math.max(0, end - 300), end));
  if (match === null) {
    return undefined;
  }
  const [whole, root = '', path = ''] = match;
  const parts = [...path.matchAll(/\.\s*([A-Za-z_$][\w$]*)|\[\s*["']([^"'\n]+)["']\s*\]/gu)].map(
    (part) => part[1] ?? part[2] ?? '',
  );
  const rootAt = end - whole.length;
  const dot = spaceBefore(text, rootAt);
  const call = text[dot - 1] === '.' ? spaceBefore(text, dot - 1) : -1;
  let base: Receiver | undefined;
  let names = parts;
  if (call > 0 && text[call - 1] === ')') {
    // Names after a call: session.getDatabase("x").users, db.getSiblingDB("x").logs.archive.
    base = receiverBefore(reading, call, source);
    names = [root, ...parts];
  } else if (root === 'db') {
    base = { onDatabase: true };
  } else {
    base = call < 0 ? variableBefore(source, root, source.at + rootAt, reading.depth) : undefined;
  }
  return withNames(base, names);
}

/** A receiver followed by names: `db.users`, a collection with a dotted name `db.logs.archive`. */
function withNames(base: Receiver | undefined, names: readonly string[]): Receiver | undefined {
  if (base === undefined || names.length === 0) {
    return base;
  }
  if (base.object !== undefined || base.cursorOf !== undefined) {
    return undefined;
  }
  return { ...base, collection: [...(base.collection === undefined ? [] : [base.collection]), ...names].join('.') };
}

/** The function called by the bracket at `bracket`. */
function calleeBefore(reading: Reading, bracket: number, source: Source): Callee | undefined {
  const { text } = reading;
  const end = spaceBefore(text, bracket);
  const method = /([A-Za-z_$][\w$]*)$/u.exec(text.slice(Math.max(0, end - 100), end))?.[1];
  if (method === undefined) {
    return undefined;
  }
  const dot = spaceBefore(text, end - method.length);
  if (text[dot - 1] !== '.') {
    return { method, onDatabase: false };
  }
  const receiver = receiverBefore(reading, dot - 1, source);
  return receiver === undefined ? { method, onDatabase: false } : { method, ...receiver };
}

/** The call on a database or a collection whose arguments hold `offset`, if any. */
export function callAt(text: string, offset: number): CallAt | undefined {
  const scanned = scan(text, offset);
  if (scanned.literal !== undefined && !/^["'`]$/u.test(scanned.literal)) {
    return undefined;
  }
  const reading: Reading = { text, openOf: scanned.openOf, depth: 0 };
  for (let index = scanned.frames.length - 1; index >= 0; index -= 1) {
    const frame = scanned.frames[index];
    if (frame?.character !== '(') {
      continue;
    }
    const callee = calleeBefore(reading, frame.position, { script: text, at: 0 });
    if (callee?.onDatabase !== true) {
      return undefined;
    }
    return {
      ...(callee.collection === undefined ? {} : { collection: callee.collection }),
      method: callee.method,
      ...(callee.cursorOf === undefined ? {} : { cursorOf: callee.cursorOf }),
      argumentIndex: frame.commas,
      argumentStart: (frame.lastComma >= 0 ? frame.lastComma : frame.position) + 1,
      ...(callee.database === undefined ? {} : { database: callee.database }),
    };
  }
  return undefined;
}

/** A member being typed after `db.`, a collection, a cursor, `db.getMongo().` or a session. */
export function memberAt(text: string, offset: number): MemberAt | undefined {
  const match = /\.\s*([A-Za-z_$][\w$]*)?$/u.exec(text.slice(0, offset));
  if (match === null) {
    return undefined;
  }
  const prefix = match[1] ?? '';
  const start = offset - prefix.length;
  const scanned = scan(text, match.index);
  if (scanned.literal !== undefined) {
    return undefined;
  }
  const receiver = receiverBefore({ text, openOf: scanned.openOf, depth: 0 }, match.index, { script: text, at: 0 });
  if (receiver === undefined) {
    return undefined;
  }
  if (receiver.object !== undefined) {
    return { kind: receiver.object, prefix, start };
  }
  if (receiver.cursorOf !== undefined) {
    return { kind: 'cursor', prefix, start };
  }
  const database = receiver.database === undefined ? {} : { database: receiver.database };
  return receiver.collection === undefined
    ? { kind: 'db', prefix, start, ...database }
    : { kind: 'collection', collection: receiver.collection, prefix, start, ...database };
}

/** Whether the caret is inside a string, a comment or a regular expression. */
export function literalAt(text: string, offset: number): string | undefined {
  return scan(text, offset).literal;
}
