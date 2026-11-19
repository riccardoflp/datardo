/**
 * The pure work of `relation.read` between its requests: a collection as sampled, the lookups the candidates need
 * (one per target field, the values of every candidate pointing there once each), and the references of the database
 * from all of it. A worker runs these on the replies the main process gathers.
 */
import type { Json } from '../../../shared/engine-request';
import { candidates } from '../candidates';
import { relations } from '../detect';
import { fields } from '../fields';
import type { Candidate, FoundValues, ReferenceGraph, SampledCollection } from '../types';
import { referenceKey } from './values';

/** A collection or a view of the database, as `listCollections` gave it. */
export interface ListedCollection {
  readonly name: string;
  readonly view: boolean;
  /** For a view, the collection it reads. */
  readonly viewOn?: string;
}

/** What was read of one collection: its count and unique fields, and its sample or why it could not be read. */
export interface CollectionReading {
  readonly documents?: number;
  readonly unique: readonly string[];
  readonly sample: { readonly documents: readonly Json[] } | { readonly unreadable: string };
}

/** A collection as sampled; a view is not sampled and keeps the collection it reads. */
export function sampledCollection(listed: ListedCollection, reading?: CollectionReading): SampledCollection {
  const base = {
    name: listed.name,
    view: listed.view,
    ...(listed.viewOn === undefined ? {} : { viewOn: listed.viewOn }),
  };
  if (listed.view || reading === undefined) {
    return { ...base, sampled: 0, fields: [], unique: [] };
  }
  const counted = reading.documents === undefined ? {} : { documents: reading.documents };
  if ('unreadable' in reading.sample) {
    return {
      ...base,
      ...counted,
      sampled: 0,
      fields: [],
      unique: reading.unique,
      unreadable: reading.sample.unreadable,
    };
  }
  const { documents } = reading.sample;
  return { ...base, ...counted, sampled: documents.length, fields: fields(documents), unique: reading.unique };
}

/** The candidates of the collections that were sampled: views and unreadable collections take no part. */
export function candidatesOf(collections: readonly SampledCollection[]): readonly Candidate[] {
  return candidates(collections.filter((collection) => !collection.view && collection.unreadable === undefined));
}

/** One lookup: the values to find in a field of a collection. */
export interface Lookup {
  readonly collection: string;
  readonly field: string;
  readonly values: readonly Json[];
}

/** The lookups of the candidates, one per target field, without duplicates (numbers of any type are one value). */
export function lookupsOf(list: readonly Candidate[]): readonly Lookup[] {
  const lookups = new Map<string, { collection: string; field: string; values: Map<string, Json> }>();
  for (const candidate of list) {
    for (const target of candidate.targets) {
      const key = `${target.collection}\u0000${target.field}`;
      const lookup = lookups.get(key) ?? { ...target, values: new Map<string, Json>() };
      lookups.set(key, lookup);
      candidate.values.forEach((value) => {
        const valueKey = referenceKey(value);
        if (!lookup.values.has(valueKey)) {
          lookup.values.set(valueKey, value);
        }
      });
    }
  }
  return [...lookups.values()].map((lookup) => ({ ...lookup, values: [...lookup.values.values()] }));
}

/** The references of a database, from its collections as sampled and what each lookup found. */
export function referenceGraph(
  database: { readonly name: string; readonly sample: number },
  collections: readonly SampledCollection[],
  found: readonly FoundValues[],
): ReferenceGraph {
  return {
    database: database.name,
    sample: database.sample,
    collections,
    relations: relations({ database: database.name, collections }, candidatesOf(collections), found),
  };
}
