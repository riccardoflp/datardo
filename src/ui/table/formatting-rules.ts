/**
 * The formatting rules of a collection tab as the window draws them: the collection's own rules from the app's state,
 * as typed in the Formatting view (`formatting-store`), whether formatting is hidden, and what `table.format-table`
 * makes of them for the page shown, which `table.rows` turns into the colors of the rows and the cells.
 */
import { useMemo } from 'react';
import type { FormatRule } from '../../shared/formatting-rules';
import { collectionRules } from '../../features/table/format-scopes';
import { tableFormat, type TableFormat } from '../../features/table/format-table';
import type { RowsFormatting } from '../../features/table/rows';
import type { ToolbarFormatting } from '../../features/table/show';
import type { Document } from '../../features/table/types';
import { shownView } from '../../features/nav/inspector';
import { navInput } from '../../features/nav/types';
import type { AppState } from '../../shared/state';
import { useAppState } from '../state/store';
import type { CollectionRef } from '../query/collection-reads';
import { memoryKey, shownRules, useFormattingMemory, type FormattingMemory } from './formatting-store';

/** The rules of a collection as the window has them now. */
export interface CollectionFormatting {
  readonly key: string;
  /** As saved. */
  readonly saved: readonly FormatRule[];
  /** As typed, the new rule not saved yet last. */
  readonly rules: readonly FormatRule[];
  readonly typedProblem?: string;
  readonly hidden: boolean;
  readonly memory: FormattingMemory;
}

/** The rules of the collection of a tab, as typed; `now` is the time `ISODate()` in a condition stands for. */
export function useCollectionFormatting(ref: CollectionRef, now: number): CollectionFormatting {
  const formatting = useAppState().table.formatting;
  const key = memoryKey(ref);
  const memory = useFormattingMemory(key);
  const { connection, database, collection } = ref;
  const saved = useMemo(
    () => collectionRules(formatting, { connection, database, collection }),
    [formatting, connection, database, collection],
  );
  const shown = useMemo(() => shownRules(saved, memory, now), [saved, memory, now]);
  return {
    key,
    saved,
    rules: shown.rules,
    ...(shown.typedProblem === undefined ? {} : { typedProblem: shown.typedProblem }),
    hidden: formatting.hidden,
    memory,
  };
}

/** The colors of the page: `table.format-table` on the documents, hidden or not. */
export function useTableFormat(
  formatting: CollectionFormatting,
  documents: readonly Document[],
  now: number,
): TableFormat {
  const { rules, hidden } = formatting;
  return useMemo(() => tableFormat(rules, documents, hidden, now), [rules, documents, hidden, now]);
}

/** What `table.rows` is given: the colors of the page and the rules that gave them. */
export function useRowsFormatting(ref: CollectionRef, documents: readonly Document[], now: number): RowsFormatting {
  const formatting = useCollectionFormatting(ref, now);
  const format = useTableFormat(formatting, documents, now);
  return useMemo(() => ({ format, rules: formatting.rules }), [format, formatting.rules]);
}

/** What the **Formatting** button of the toolbar says: the rules on, hidden or not, the view shown. */
export function toolbarFormatting(state: AppState, formatting: CollectionFormatting): ToolbarFormatting {
  const input = navInput(state);
  return {
    on: formatting.saved.filter((rule) => rule.enabled !== false).length,
    hidden: formatting.hidden,
    shown: !state.nav.inspectorHidden && shownView(input) === 'formatting',
  };
}
