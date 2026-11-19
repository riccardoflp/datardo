/**
 * The text of the interface of the schema area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function plural(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The text of the schema area. */
export const text = {
  section: 'Schema',
  analyze: 'Analyze',
  analyzing: 'Analyzing…',
  line: {
    sample: (analyzed: number, outOf: number) =>
      `Random sample of ${groupThousands(analyzed)} out of ${plural(outOf, 'document', 'documents')}`,
    all: (analyzed: number) => `All ${plural(analyzed, 'document', 'documents')}`,
    time: (milliseconds: number) => `${groupThousands(milliseconds)} ms`,
  },
  sample: { label: 'Sample', hint: 'Documents analyzed: a random sample when more match the filter' },
  validationRules: 'Validation rules…',
  generate: 'Generate…',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  columns: { field: 'Field', present: 'Present', types: 'Types', values: 'Values' },
  moreFields: '(500+ fields)',
  tooManyFields: 'Too many different fields: only the first 500 were analyzed.',
  present: {
    some: (count: number, of: number) =>
      `In ${groupThousands(count)} of ${groupThousands(of)}, missing in ${groupThousands(of - count)}`,
    all: (of: number) => `In all ${groupThousands(of)}`,
  },
  typeHint: (path: string, type: string) => `Filter on ${path} of type ${type}`,
  rangeHint: (from: string, to: string, count: number) =>
    `${from} – ${to}: ${groupThousands(count)}. Click to filter on this range.`,
  valueHint: (value: string, count: number, of: number) =>
    `${value}: ${groupThousands(count)} of ${groupThousands(of)}. Click to filter on it.`,
  more: (count: number, uncounted: boolean) => `+${groupThousands(count)}${uncounted ? '+' : ''} more`,
  allDistinct: 'all distinct, e.g.',
  lengths: (smallest: number, largest: number, average: number) =>
    smallest === largest
      ? plural(smallest, 'element', 'elements')
      : `${groupThousands(smallest)}–${groupThousands(largest)} elements, avg ${String(average)}`,
  objectFields: (count: number) => `{ ${plural(count, 'field', 'fields')} }`,
  states: {
    noDocuments: 'No documents match the filter.',
    cancelled: 'Cancelled',
    runAgain: 'Run again',
  },
  refusals: {
    invalidFilter: 'Invalid query syntax — check the highlighted field.',
    mustBeObject: 'must be an object',
    fixFilter: (reason: string) => `Fix the filter before adding conditions by drag & drop: ${reason}`,
  },
  filter: {
    title: 'Add a condition to the filter',
    step: (condition: string, collection: string) => `add ${condition} to the filter of ${collection}`,
    tabOnly: 'It changes the filter of the tab, not a deployment, so nothing is recorded.',
  },
  show: {
    plan: (collection: string) => `Show the Schema section of ${collection}`,
    step: (collection: string) => `show the Schema section of ${collection}`,
  },
  nothingRecorded: 'Nothing is written to a deployment, so nothing is recorded.',
  commands: { show: 'Schema', sample: 'Analyze schema' },
};
