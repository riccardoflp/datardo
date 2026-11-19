/**
 * Feature: tree.count
 *
 * Reads the number of documents of the collections of an expanded database, the estimate the server keeps
 * (`estimatedDocumentCount`, which scans nothing), and writes counts and sizes in short beside the nodes. Each count
 * is a request of its own: one that fails leaves its collection without a count, and shows no error.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { failureOf, numberOf, textArg, textsArg, type DatabaseContents } from './types';

/** How many collections of a database are counted, in the order of the tree (Datardo's choice). */
export const mostCounted = 500;

/** How long each count may take, in ms (R9.2; Datardo's choice). */
export const countTimeLimitMs = 5000;

/** The collections of a database that are counted: neither a view, a time series nor a system collection; the first 500. */
export function countedCollections(contents: DatabaseContents): readonly string[] {
  return contents.entries
    .filter((entry) => entry.kind === 'collection' && !entry.system)
    .slice(0, mostCounted)
    .map((entry) => entry.name);
}

/** `db.getSiblingDB("<database>").<collection>.estimatedDocumentCount()`. */
export function countRequest(database: string, collection: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    collection,
    method: 'estimatedDocumentCount',
    arguments: [],
    timeLimitMs: countTimeLimitMs,
  };
}

/**
 * Feature: tree.count — the counts of `args.collections` (`{ connection, database, collections }`), one request
 * each, for the first 500 named.
 */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection'));
  const database = textArg(args, 'database');
  return {
    kind: 'engine',
    requests: textsArg(args, 'collections')
      .slice(0, mostCounted)
      .map((collection) => ({ connection, request: countRequest(database, collection) })),
  };
}

/**
 * Feature: tree.count — the counts that arrived, by collection name, in the order of the requests. A request that
 * failed gives no count.
 */
export function parse(replies: readonly unknown[], args: Json): Readonly<Record<string, number>> {
  const names = textsArg(args, 'collections').slice(0, mostCounted);
  const counts: Record<string, number> = {};
  names.forEach((name, index) => {
    const reply = replies[index];
    const count = failureOf(reply) === undefined ? numberOf(reply) : undefined;
    if (count !== undefined) {
      counts[name] = count;
    }
  });
  return counts;
}

/** A whole number with a comma every three digits: `1,204`. */
export function withSeparators(count: number): string {
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

const shortUnits = [
  { size: 1e3, letter: 'K' },
  { size: 1e6, letter: 'M' },
  { size: 1e9, letter: 'B' },
] as const;

/** A figure of a unit: one decimal under 100, none from 100, and no `.0`. */
function figure(value: number): { readonly text: string; readonly rounded: number } {
  if (value < 100) {
    const tenths = Math.round(value * 10) / 10;
    if (tenths < 100) {
      return { text: String(tenths), rounded: tenths };
    }
  }
  const whole = Math.round(value);
  return { text: String(whole), rounded: whole };
}

/**
 * A count in short: with separators under 10,000 (`980`, `1,204`); in thousands, millions or billions from there,
 * with one decimal while the figure is under 100 and no `.0` (`12.3K`, `120K`, `1.3M`, `2B`). Datardo's choice.
 */
export function countText(count: number): string {
  if (count < 10_000) {
    return withSeparators(count);
  }
  let index = shortUnits.findLastIndex((unit) => count >= unit.size);
  for (;;) {
    const unit = shortUnits[index] ?? shortUnits[0];
    const { text, rounded } = figure(count / unit.size);
    const next = shortUnits[index + 1];
    if (rounded < 1000 || next === undefined) {
      return `${text}${unit.letter}`;
    }
    index += 1;
  }
}

const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A size in bytes, by 1,024, with one decimal except for `B` (`512 B`, `1.5 KB`, `1.0 GB`); a size of 0 is not written. */
export function sizeText(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) {
    return '';
  }
  const index = Math.min(sizeUnits.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const unit = sizeUnits[index] ?? 'B';
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${unit}`;
}
