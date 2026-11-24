/**
 * The formatting rules of a collection tab as the window draws them: the rules of the four sections that reach the
 * collection from the app's state, as typed in the Formatting view (`formatting-store`), the sections it leaves out,
 * whether formatting is hidden, and what `table.format-table` makes of them for the page shown, which `table.rows`
 * turns into the colors of the rows and the cells.
 */
import { useMemo } from 'react';
import type { FormatRule, FormatScope } from '../../shared/formatting-rules';
import {
  collectionRules,
  orderedRules,
  rulesByScope,
  rulesOn,
  scopesOff,
  type RulesByScope,
} from '../../features/table/format-scopes';
import { tableFormat, type TableFormat } from '../../features/table/format-table';
import type { RowsFormatting } from '../../features/table/rows';
import type { ToolbarFormatting } from '../../features/table/show';
import type { Document } from '../../features/table/types';
import { shownView } from '../../features/nav/inspector';
import { navInput } from '../../features/nav/types';
import type { AppState } from '../../shared/state';
import { useAppState } from '../state/store';
import type { CollectionRef } from '../query/collection-reads';
import { memoryKey, shownSections, useFormattingMemory, type FormattingMemory } from './formatting-store';

/** The rules of a collection as the window has them now. */
export interface CollectionFormatting {
  readonly key: string;
  /** The collection's own, as saved. */
  readonly saved: readonly FormatRule[];
  /** The four sections as saved. */
  readonly savedSections: RulesByScope;
  /** The four sections as typed, the new rule not saved yet last of the collection's. */
  readonly sections: RulesByScope;
  /** The sections the collection leaves out. */
  readonly off: readonly FormatScope[];
  /** The rules that color the table, in the order they are tried, as typed. */
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
  const kept = useMemo(() => {
    const where = { connection, database, collection };
    return {
      saved: collectionRules(formatting, where),
      sections: rulesByScope(formatting, where),
      off: scopesOff(formatting, where),
    };
  }, [formatting, connection, database, collection]);
  const shown = useMemo(() => shownSections(kept.sections, memory, now), [kept, memory, now]);
  const rules = useMemo(
    () => orderedRules(shown.sections, kept.off).map((each) => each.rule),
    [shown.sections, kept.off],
  );
  return {
    key,
    saved: kept.saved,
    savedSections: kept.sections,
    sections: shown.sections,
    off: kept.off,
    rules,
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

/** What the **Formatting** button of the toolbar says: the rules on that reach the table, hidden or not, the view shown. */
export function toolbarFormatting(
  state: AppState,
  formatting: CollectionFormatting,
  ref: CollectionRef,
): ToolbarFormatting {
  const input = navInput(state);
  const { connection, database, collection } = ref;
  return {
    on: rulesOn(state.table.formatting, { connection, database, collection }),
    hidden: formatting.hidden,
    shown: !state.nav.inspectorHidden && shownView(input) === 'formatting',
  };
}
