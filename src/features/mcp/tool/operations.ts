/**
 * The text of `current_operations` and `collection_stats` (`mcp.performance-tools`): an entry of `currentOp`, and the
 * sizes and uses of a collection's indexes. With `datardo.mcp.readData` off, a command is written as its shape.
 */
import type { Json } from '../../../shared/engine-request';
import { clippedLine, counted } from '../output-limits';
import { listOf, numberIn, recordOf, shellText, textIn, dateIn } from './mongo';
import { queryShape, withoutNoise } from './slow-ops';
import { sizeText } from './units';

type Entry = Readonly<Record<string, unknown>>;

/** A duration in microseconds: `12.3 s`, `450 ms`, `80 µs`. */
export function microsText(micros: number | undefined): string {
  if (micros === undefined) {
    return '?';
  }
  if (micros >= 1e6) {
    return `${(micros / 1e6).toFixed(1)} s`;
  }
  return micros >= 1e3 ? `${String(Math.round(micros / 1e3))} ms` : `${String(Math.round(micros))} µs`;
}

/** How long an operation has run, in microseconds. */
export function microsOf(op: Entry): number {
  const micros = numberIn(op['microsecs_running']);
  if (micros !== undefined) {
    return micros;
  }
  return (numberIn(op['secs_running']) ?? 0) * 1e6;
}

/** The command of an operation on one line without its session fields, cut at 300; its shape without `readData`. */
export function commandLine(command: unknown, readData: boolean): string {
  if (typeof command !== 'object' || command === null) {
    return '';
  }
  const kept = withoutNoise(command);
  return clippedLine(readData ? shellText(kept) : queryShape(kept));
}

function whoLine(op: Entry): string {
  const users = listOf(op['effectiveUsers'])
    .map(recordOf)
    .map((user) => `${String(user['user'])}@${String(user['db'])}`)
    .join(', ');
  const client = textIn(op['client']) ?? textIn(op['client_s']);
  const desc = textIn(op['desc']);
  const app = textIn(op['appName']);
  return [
    client === undefined ? 'internal (no client)' : `client ${client}`,
    ...(desc === undefined ? [] : [`(${desc})`]),
    ...(app === undefined ? [] : [`app ${JSON.stringify(app)}`]),
    ...(users === '' ? [] : [`user ${users}`]),
  ].join(' ');
}

function stateParts(op: Entry): readonly string[] {
  const locks = recordOf(op['locks']);
  const message = textIn(op['msg']);
  const progress = recordOf(op['progress']);
  const total = numberIn(progress['total']);
  return [
    ...(op['waitingForLock'] === true ? ['WAITING FOR A LOCK'] : []),
    ...(Object.keys(locks).length === 0 ? [] : [`locks ${shellText(locks)}`]),
    ...(message === undefined
      ? []
      : [`${message}${total ? ` (${String(numberIn(progress['done']) ?? 0)}/${String(total)})` : ''}`]),
    ...(op['killPending'] === true ? ['kill pending'] : []),
  ];
}

function transactionLine(op: Entry): readonly string[] {
  if (op['transaction'] === undefined) {
    return [];
  }
  const transaction = recordOf(op['transaction']);
  const number = recordOf(transaction['parameters'])['txnNumber'];
  const open = numberIn(transaction['timeOpenMicros']);
  const active = numberIn(transaction['timeActiveMicros']);
  const expiry = dateIn(transaction['expiryTime']);
  const parts = [
    ...(number === undefined ? [] : [`txnNumber ${shellText(number)}`]),
    ...(open === undefined ? [] : [`open ${microsText(open)}`]),
    ...(active === undefined ? [] : [`active ${microsText(active)}`]),
    ...(expiry === undefined ? [] : [`expires ${new Date(expiry).toISOString()}`]),
  ];
  return [`  transaction ${parts.join(', ')}`];
}

/** An entry of `currentOp` as text. */
export function operationText(op: Entry, readData: boolean): string {
  const plan = textIn(op['planSummary']);
  const head = [
    `opid ${shellText(op['opid'] ?? null)}`,
    op['active'] === true ? 'active' : 'idle',
    microsText(microsOf(op)),
    textIn(op['op']) ?? textIn(op['type']) ?? '?',
    ...(textIn(op['ns']) === undefined || op['ns'] === '' ? [] : [String(op['ns'])]),
    ...(plan === undefined ? [] : [`plan ${plan}`]),
  ];
  const command = commandLine(op['command'] ?? op['query'], readData);
  const state = stateParts(op);
  return [
    `- ${head.join(' · ')}`,
    ...(command === '' ? [] : [`  ${command}`]),
    `  ${whoLine(op)}`,
    ...(state.length === 0 ? [] : [`  ${state.join(' · ')}`]),
    ...transactionLine(op),
  ].join('\n');
}

/** The uses of an index from `$indexStats`, summed over the hosts and shards. */
export interface IndexUse {
  readonly ops: number;
  readonly since?: number;
  readonly hosts: number;
  readonly building: boolean;
}

/** The uses of each index, by name. */
export function indexUses(stats: readonly unknown[]): ReadonlyMap<string, IndexUse> {
  const uses = new Map<string, IndexUse>();
  for (const stat of stats.map(recordOf)) {
    const name = String(stat['name']);
    const use = uses.get(name) ?? { ops: 0, hosts: 0, building: false };
    const accesses = recordOf(stat['accesses']);
    const since = dateIn(accesses['since']);
    const latest = since === undefined ? use.since : Math.max(use.since ?? since, since);
    uses.set(name, {
      ops: use.ops + (numberIn(accesses['ops']) ?? 0),
      hosts: use.hosts + (stat['accesses'] === undefined ? 0 : 1),
      building: use.building || stat['building'] === true,
      ...(latest === undefined ? {} : { since: latest }),
    });
  }
  return uses;
}

function sumOf(storage: readonly Entry[], field: string): number | undefined {
  return storage.some((each) => each[field] !== undefined)
    ? storage.reduce((total, each) => total + (numberIn(each[field]) ?? 0), 0)
    : undefined;
}

function sizeOrUnknown(bytes: number | undefined): string {
  return bytes === undefined ? '?' : sizeText(bytes);
}

function indexLine(index: Entry, storage: readonly Entry[], uses: ReadonlyMap<string, IndexUse>): string {
  const name = String(index['name']);
  const sizes = storage
    .map((each) => numberIn(recordOf(each['indexSizes'])[name]))
    .filter((each) => each !== undefined);
  const use = uses.get(name);
  const building = storage.some((each) => listOf(each['indexBuilds']).includes(name)) || use?.building === true;
  const ttl = numberIn(index['expireAfterSeconds']);
  const parts = [
    sizes.length === 0 ? 'size ?' : sizeText(sizes.reduce((total, each) => total + each, 0)),
    ...(use === undefined || use.hosts === 0
      ? []
      : [
          `${counted(use.ops, 'use')}${use.since === undefined ? '' : ` since ${new Date(use.since).toISOString()}`}${use.hosts > 1 ? ` (sum over ${String(use.hosts)} hosts)` : ''}`,
        ]),
    ...(index['unique'] === true ? ['unique'] : []),
    ...(index['sparse'] === true ? ['sparse'] : []),
    ...(ttl === undefined ? [] : [`TTL ${String(ttl)}s`]),
    ...(index['partialFilterExpression'] === undefined
      ? []
      : [`partial ${shellText(index['partialFilterExpression'])}`]),
    ...(index['hidden'] === true ? ['hidden'] : []),
    ...(building ? ['BUILDING'] : []),
  ];
  return `- ${name} ${shellText(index['key'] ?? {})}: ${parts.join(', ')}`;
}

/** The text of `collection_stats`, from `$collStats` (one per shard), `listIndexes` and `$indexStats`. */
export function statsText(
  name: string,
  timeseries: boolean,
  read: { readonly storage: readonly Entry[]; readonly indexes: readonly Entry[]; readonly stats: readonly Json[] },
): string {
  const { storage, indexes, stats } = read;
  const uses = indexUses(stats);
  const documents = sumOf(storage, 'count');
  const size = sumOf(storage, 'size');
  const onDisk = sumOf(storage, 'storageSize');
  const free = sumOf(storage, 'freeStorageSize');
  const indexSize = sumOf(storage, 'totalIndexSize');
  const first = storage[0] ?? {};
  const maxSize = numberIn(first['maxSize']);
  const most = numberIn(first['max']);
  return [
    `${name}${timeseries ? ' (time series collection)' : ''}${storage.length > 1 ? ` on ${counted(storage.length, 'shard')}` : ''}:`,
    `- documents: ${documents === undefined ? '?' : documents.toLocaleString('en-US')}`,
    `- data size: ${sizeOrUnknown(size)} (uncompressed), average document ${documents ? sizeText(Math.round((size ?? 0) / documents)) : '–'}`,
    `- storage size: ${sizeOrUnknown(onDisk)} on disk${size && onDisk ? `, ${(size / onDisk).toFixed(1)}x compression` : ''}${free === undefined ? '' : `, of which ${sizeText(free)} free and reusable`}`,
    `- capped: ${first['capped'] === true ? `yes${maxSize ? `, max ${sizeText(maxSize)}` : ''}${most ? `, max ${counted(most, 'document')}` : ''}` : 'no'}`,
    `- indexes: ${String(indexes.length)}, total size ${sizeOrUnknown(indexSize)}${size && indexSize ? ` (${String(Math.round((indexSize / size) * 100))}% of the data size)` : ''}`,
    '',
    'Indexes:',
    ...indexes.map((index) => indexLine(index, storage, uses)),
  ].join('\n');
}
