/**
 * The value of a run, as the result shows it (`playground.results`), from the value of the script's last expression
 * as the process of the run has it: a cursor, of which it read at most 201 documents, or a value as canonical
 * Extended JSON, or a value that cannot be BSON, as text.
 */
import type { Json } from '../../../shared/engine-request';
import { resultDocuments } from '../runtime/calls';
import type { RunValue } from '../types';
import { isDocuments } from './table';

/** The value of the last expression, as the process has it. */
export type LastValue =
  | { readonly kind: 'cursor'; readonly documents: readonly Json[] }
  | { readonly kind: 'value'; readonly value: Json }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'none' };

/** The value shown: a cursor's first 200 documents and whether it had more; documents; another value; or none. */
export function resultValue(last: LastValue): RunValue {
  switch (last.kind) {
    case 'cursor':
      return {
        kind: 'documents',
        documents: last.documents.slice(0, resultDocuments),
        more: last.documents.length > resultDocuments,
      };
    case 'value':
      return isDocuments(last.value)
        ? { kind: 'documents', documents: last.value, more: false }
        : { kind: 'value', value: last.value };
    case 'text':
    case 'none':
      return last;
  }
}
