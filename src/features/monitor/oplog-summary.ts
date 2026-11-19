/**
 * Feature: monitor.oplog-summary
 *
 * One line per oplog entry: its kind, the `_id` it is about and what it changes, at most 300 characters then `…`.
 * Values are written in mongosh syntax (`query.format`) with their numbers plain. Ported from Mongoster's
 * `src/replication.ts › oplogEntry`, `updatedFields`.
 */
import type { Json } from '../../shared/engine-request';
import { formattedValue } from '../query/format';
import { dateOf, isRecord, listOf, plainNumbers, recordOf, textOf, timestampOf, type JsonRecord } from './parts/ejson';

/** The longest summary, in characters, before `…`. */
export const longestSummary = 300;

/** The kinds of an oplog entry, as the table shows them. */
export type OplogKind = 'insert' | 'update' | 'delete' | 'noop' | 'transaction' | 'command';

/** One row of the oplog table (glossary, "oplog entry"). */
export interface OplogRow {
  /** The timestamp as `seconds:increment`, which tells entries apart. */
  readonly key: string;
  /** Its `wall`, else its timestamp's seconds, in milliseconds since 1970. */
  readonly time: number;
  /** An {@link OplogKind}, or the server's own `op` for another entry. */
  readonly kind: string;
  readonly namespace: string;
  /** The `_id` in mongosh syntax. */
  readonly id?: string;
  readonly summary: string;
  /** The whole entry, for the inspector island. */
  readonly entry: Json;
}

const kindsOfOp: Readonly<Record<string, OplogKind>> = {
  i: 'insert',
  u: 'update',
  d: 'delete',
  c: 'command',
  n: 'noop',
};

/** A value on one line in mongosh syntax, its numbers plain: `{ _id: 7, status: "new" }`. */
export function shellText(value: Json): string {
  return formattedValue(plainNumbers(value), 'one-line');
}

/** A text cut at 300 characters with `…`. */
export function clipped(summary: string, most: number = longestSummary): string {
  const characters = Array.from(summary);
  return characters.length > most ? `${characters.slice(0, most).join('')}…` : summary;
}

/** The fields an update sets and removes, from its `diff` (`$v: 2`) or its `$set` and `$unset`. */
export function updatedFields(change: JsonRecord): {
  readonly set: readonly string[];
  readonly unset: readonly string[];
} {
  const set: string[] = [];
  const unset: string[] = [];
  const walk = (diff: JsonRecord, prefix: string): void => {
    for (const [key, value] of Object.entries(diff)) {
      if (key === 'u' || key === 'i') {
        set.push(...Object.keys(recordOf(value)).map((field) => prefix + field));
      } else if (key === 'd') {
        unset.push(...Object.keys(recordOf(value)).map((field) => prefix + field));
      } else if (key === 'l') {
        set.push(`${prefix.slice(0, -1)} (length)`);
      } else if (/^u\d+$/u.test(key)) {
        set.push(prefix + key.slice(1));
      } else if (key.startsWith('s')) {
        walk(recordOf(value), `${prefix}${key.slice(1)}.`);
      }
    }
  };
  if (isRecord(change['diff'])) {
    walk(change['diff'], '');
  } else {
    set.push(...Object.keys(recordOf(change['$set'])));
    unset.push(...Object.keys(recordOf(change['$unset'])));
  }
  return { set: [...new Set(set)], unset: [...new Set(unset)] };
}

/** Whether the `o` of an update holds a whole document (a replacement), not operators or a diff. */
function isReplacement(change: JsonRecord): boolean {
  return !isRecord(change['diff']) && !('$set' in change) && !('$unset' in change) && !('$v' in change);
}

function updateSummary(change: JsonRecord): string {
  if (isReplacement(change)) {
    return `replace with ${shellText(change)}`;
  }
  const fields = updatedFields(change);
  const parts = [
    fields.set.length === 0 ? '' : `set ${fields.set.join(', ')}`,
    fields.unset.length === 0 ? '' : `unset ${fields.unset.join(', ')}`,
  ].filter((part) => part !== '');
  return parts.length === 0 ? 'no change' : parts.join(' · ');
}

/** What a command of an entry is: its name and the namespace it names, `create shop.orders`. */
function commandLabel(command: JsonRecord, namespace: string): { readonly name: string; readonly label: string } {
  const [name = ''] = Object.keys(command);
  const target = command[name];
  const database = namespace.split('.')[0] ?? '';
  return { name, label: typeof target === 'string' ? `${name} ${database}.${target}` : name };
}

function transactionSummary(entry: JsonRecord, operations: readonly Json[]): string {
  const counts = new Map<string, number>();
  for (const each of operations.map(recordOf)) {
    const namespace = textOf(each['ns']) ?? '';
    const label =
      each['op'] === 'c'
        ? commandLabel(recordOf(each['o']), namespace).label
        : `${kindsOfOp[textOf(each['op']) ?? ''] ?? textOf(each['op']) ?? '?'} ${namespace}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts].map(([label, count]) => (count > 1 ? `${String(count)} × ${label}` : label));
  const previous = timestampOf(recordOf(entry['prevOpTime'])['ts'])?.t ?? 0;
  const larger = entry['partialTxn'] === true || previous > 0 ? ' (part of a larger transaction)' : '';
  const noun = operations.length === 1 ? 'operation' : 'operations';
  return `${String(operations.length)} ${noun}: ${parts.join(', ')}${larger}`;
}

function commandSummary(change: JsonRecord, namespace: string): string {
  const { name, label } = commandLabel(change, namespace);
  const rest = Object.fromEntries(Object.entries(change).filter(([key]) => key !== name));
  return Object.keys(rest).length === 0 ? label : `${label} ${shellText(rest)}`;
}

function idText(value: Json | undefined): string | undefined {
  return value === undefined ? undefined : shellText(value);
}

function kindAndSummary(entry: JsonRecord, namespace: string): Pick<OplogRow, 'kind' | 'id' | 'summary'> {
  const change = recordOf(entry['o']);
  const op = textOf(entry['op']) ?? '';
  const optionalId = (id: string | undefined): { readonly id?: string } => (id === undefined ? {} : { id });
  switch (op) {
    case 'i':
      return { kind: 'insert', ...optionalId(idText(change['_id'])), summary: shellText(change) };
    case 'u':
      return { kind: 'update', ...optionalId(idText(recordOf(entry['o2'])['_id'])), summary: updateSummary(change) };
    case 'd':
      return { kind: 'delete', ...optionalId(idText(change['_id'])), summary: '' };
    case 'n':
      return { kind: 'noop', summary: textOf(change['msg']) ?? shellText(change) };
    case 'c':
      return Array.isArray(change['applyOps'])
        ? { kind: 'transaction', summary: transactionSummary(entry, listOf(change['applyOps'])) }
        : { kind: 'command', summary: commandSummary(change, namespace) };
    default:
      return { kind: op === '' ? '?' : op, summary: shellText(change) };
  }
}

/** Feature: monitor.oplog-summary — the row of an oplog entry. */
export function oplogRow(entry: Json): OplogRow {
  const fields = recordOf(entry);
  const timestamp = timestampOf(fields['ts']);
  const namespace = textOf(fields['ns']) ?? '';
  const read = kindAndSummary(fields, namespace);
  return {
    key: `${String(timestamp?.t ?? 0)}:${String(timestamp?.i ?? 0)}`,
    time: dateOf(fields['wall']) ?? (timestamp?.t ?? 0) * 1000,
    namespace,
    ...read,
    summary: clipped(read.summary),
    entry,
  };
}
