/**
 * Feature: index.duplicate
 *
 * Opens the index dialog on a copy of an existing index without its name, to create a variant of it. `index.create`
 * does the write.
 */
import { editableDefinition } from './change-plan';
import { openDialog, type IndexDialogState } from './dialog';
import type { IndexDefinition, IndexInfo, IndexList } from './types';

/** What **Duplicate…** starts from: the collection, the index copied and the indexes listed. */
export interface DuplicateState {
  readonly collection: string;
  readonly index: IndexInfo;
  readonly list?: IndexList;
}

/** Feature: index.duplicate — the definition of an index as `createIndex` takes it, without its name. */
export function copiedDefinition(index: IndexInfo): IndexDefinition {
  const { keys, options } = editableDefinition(index.name, index.key, index.options);
  const { name: _name, ...rest } = options;
  return { keys, options: rest };
}

/** Feature: index.duplicate — the dialog of `index.create` on the copy, with an empty **Name**. */
export function view(state: DuplicateState): IndexDialogState {
  return openDialog({
    collection: state.collection,
    definition: copiedDefinition(state.index),
    ...(state.list === undefined ? {} : { list: state.list }),
  });
}
