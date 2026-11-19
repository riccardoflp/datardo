/**
 * What the cards of the relation area share: the fields of a sample (`relation.fields`), the candidates that are looked
 * up (`relation.candidates`), the relations found (`relation.detect`), the collections of a database as sampled and the
 * references kept for it (`relation.read`), and the boxes of the diagram (`relation.layout`). Values are canonical
 * Extended JSON (R5.5).
 */
import type { Json } from '../../shared/engine-request';

/** What a value is compared as when it is looked up: numbers of every BSON type are one type. */
export type ReferenceType = 'objectId' | 'uuid' | 'string' | 'number';

/** The distinct sampled values of one type of a field, in the order of the sample. */
export interface TypedValues {
  readonly type: ReferenceType;
  readonly values: readonly Json[];
}

/** A collection a DBRef names: `$ref`, and `$db` when the DBRef has one. */
export interface DbRefTarget {
  readonly collection: string;
  readonly database?: string;
}

/** A field of the sampled documents of a collection (`relation.fields`). */
export interface SampledField {
  /** The dotted path, without array positions, as a filter writes it: `items.productId`. */
  readonly path: string;
  /** The path with the arrays it goes through: `items[].productId`. */
  readonly label: string;
  /** 0 for a top-level field. */
  readonly depth: number;
  /** The types seen, the most frequent first, with the names of the Schema section and `dbref`. */
  readonly types: readonly string[];
  /** The share of the sampled documents that have it, from 0 to 1. */
  readonly share: number;
  /** Whether it holds several values: an array of values or DBRefs, or a field of the documents of an array. */
  readonly several: boolean;
  /** Per type of `relation.candidates`, up to 100 distinct values. */
  readonly values: readonly TypedValues[];
  /** The collections its DBRefs name, in the order of the sample. */
  readonly dbrefs: readonly DbRefTarget[];
}

/** A collection or a view of a database, as `relation.read` sampled it. */
export interface SampledCollection {
  readonly name: string;
  /** For a view, the collection it reads. */
  readonly viewOn?: string;
  readonly view: boolean;
  /** The estimated number of documents; absent for a view, or when the count failed. */
  readonly documents?: number;
  /** The number of documents sampled. */
  readonly sampled: number;
  readonly fields: readonly SampledField[];
  /** The fields of its unique indexes of one field (not partial, not `_id`). */
  readonly unique: readonly string[];
  /** The server's message when its sample could not be read: it takes no part in the references. */
  readonly unreadable?: string;
}

/** A field where a candidate may point: a collection and its `_id` or one of its unique fields. */
export interface TargetField {
  readonly collection: string;
  readonly field: string;
}

/** A field whose sampled values are looked up, with the values and where (`relation.candidates`). */
export interface Candidate {
  readonly collection: string;
  readonly field: SampledField;
  readonly type: ReferenceType;
  /** Up to 20 values. */
  readonly values: readonly Json[];
  readonly targets: readonly TargetField[];
}

/** Of a target field, the values looked up that exist there, as the server gave them back. */
export interface FoundValues {
  readonly collection: string;
  readonly field: string;
  readonly values: readonly Json[];
}

/** What kind of relation an arrow is. */
export type RelationKind = 'reference' | 'dbref' | 'view';

/** An arrow of the diagram: a reference, a DBRef or a view on its collection (`relation.detect`). */
export interface Relation {
  readonly from: string;
  /** The path of the field it leaves; empty for a view. */
  readonly field: string;
  readonly fieldLabel: string;
  readonly to: string;
  /** The field it reaches: `_id` or a unique field; empty for a view. */
  readonly toField: string;
  /** Whether the field holds several references. */
  readonly several: boolean;
  readonly kind: RelationKind;
  /** Of the values looked up, how many were found; 0 for a DBRef or a view. */
  readonly found: number;
  readonly lookedUp: number;
}

/** The references of a database, as `relation.read` found them with a sample of `sample` documents per collection. */
export interface ReferenceGraph {
  readonly database: string;
  readonly sample: number;
  /** In order of name; views included. */
  readonly collections: readonly SampledCollection[];
  readonly relations: readonly Relation[];
}

/** A box of the diagram: where a collection is drawn. */
export interface Box {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The boxes of the diagram and the size of the whole drawing (`relation.layout`). */
export interface Layout {
  readonly boxes: readonly Box[];
  readonly width: number;
  readonly height: number;
}

/** Where a reference leads, or which documents refer to one: a collection and a filter on it. */
export interface ReferenceTarget {
  readonly collection: string;
  /** The filter as canonical Extended JSON. */
  readonly filter: Json;
  /** The filter in mongosh syntax. */
  readonly filterText: string;
  /** `users._id`, `orders.customer`, `posts.comments[].authorId`. */
  readonly label: string;
  /** The number of values looked for. */
  readonly count: number;
}

/** Texts compared by their code units, so that an order does not depend on the system's language (R3.2). */
export function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
