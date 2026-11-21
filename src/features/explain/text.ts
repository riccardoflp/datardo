/**
 * The text of the interface of the explain area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';
import type { ExplainKind } from './types';

function plural(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The text of the explain area. */
export const text = {
  section: 'Explain',
  /** The menu of the section bar that holds **Explain** (product.md, the section bar). */
  more: 'More',
  title: (kind: ExplainKind) => `Explain · ${kind}`,
  raw: 'Raw',
  summary: 'Summary',
  running: 'Running explain…',
  failed: 'The query failed while it was explained.',
  cancelled: 'Cancelled',
  runAgain: 'Run again',
  verdict: {
    collscan: 'COLLSCAN',
    collscanHint: 'Every document of the collection is read: no index is used for the filter',
    index: (name: string) => `index ${name}`,
    inMemorySort: 'in-memory sort',
    inMemorySortHint:
      'No index provides the sort order: results are sorted in memory (limited to 100 MB unless spilling to disk)',
    rejectedPlans: (count: number) => plural(count, 'rejected plan', 'rejected plans'),
  },
  numbers: {
    returned: 'returned',
    keysExamined: 'keys examined',
    docsExamined: 'documents examined',
    time: 'time',
    milliseconds: (value: number) => `${groupThousands(value)} ms`,
  },
  note: {
    perReturned: (ratio: number) => `${groupThousands(ratio)} documents examined for each one returned.`,
    noneReturned: (examined: number) => `${groupThousands(examined)} documents examined, none returned.`,
  },
  suggestion: {
    label: 'Suggested index:',
    hint: 'Equality fields first, then the sort, then range fields (ESR rule)',
    create: 'Create…',
    createHint: 'Open the index dialog with this index ready to create',
  },
  winningPlan: 'Winning plan',
  stagesAfterQuery: 'Pipeline stages after the query',
  counts: {
    out: (value: number) => `${groupThousands(value)} out`,
    keys: (value: number) => `${groupThousands(value)} keys`,
    docs: (value: number) => `${groupThousands(value)} docs`,
    about: (value: number) => `~${groupThousands(value)} ms`,
  },
  shard: 'SHARD',
  rawSize: {
    fields: (count: number) => plural(count, 'field', 'fields'),
    items: (count: number) => plural(count, 'item', 'items'),
  },
  refusals: {
    invalidQuery: 'Invalid query syntax — check the highlighted field.',
    mustBeObject: 'must be an object',
    writes: (stage: string) => `A pipeline ending with ${stage} can't be explained here: select an earlier stage.`,
  },
  show: {
    plan: (collection: string) => `Show the Explain section of ${collection}`,
    step: (collection: string) => `show the Explain section of ${collection}`,
  },
  nothingRecorded: 'Nothing is written to a deployment, so nothing is recorded.',
  commands: { show: 'Explain', run: 'Run explain' },
};
