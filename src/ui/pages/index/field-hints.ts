/**
 * The fields of the documents of a collection, as the query bar suggests them (`query.field-hints`), read once when
 * an index dialog opens: the dialogs suggest them for the paths of an index and in their editors.
 */
import { useEffect, useState } from 'react';
import type { FieldHint } from '../../../features/query/field-hints';
import { connectionId } from '../../../shared/ids';

/** The collection the fields are read from. */
export interface HintsPlace {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
}

/** Reads the fields of a collection's sample; nothing when the read fails. */
export async function readFieldHints(where: HintsPlace): Promise<readonly FieldHint[]> {
  const result = await window.datardo.start({
    feature: 'query.field-hints' as never,
    target: {
      kind: 'collection',
      connection: connectionId(where.connection),
      database: where.database,
      collection: where.collection,
    },
    args: { connection: where.connection, database: where.database, collection: where.collection },
  });
  return result.kind === 'read' ? (result.result as readonly FieldHint[]) : [];
}

/** The fields of the collection; `undefined` until they have been read. */
export function useFieldHints(where: HintsPlace): readonly FieldHint[] | undefined {
  const [hints, setHints] = useState<readonly FieldHint[] | undefined>(undefined);
  const { connection, database, collection } = where;
  useEffect(() => {
    let live = true;
    void readFieldHints({ connection, database, collection }).then((read) => {
      if (live) {
        setHints(read);
      }
    });
    return () => {
      live = false;
    };
  }, [connection, database, collection]);
  return hints;
}
