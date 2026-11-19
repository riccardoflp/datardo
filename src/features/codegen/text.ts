/**
 * The text of the interface of the codegen area, word for word as its cards write it (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** The text of the codegen area. */
export const text = {
  section: 'Code',
  title: (collection: string, words: string) => `Code · ${collection} · ${words}`,
  titles: {
    find: 'find',
    aggregate: (stages: number) => `aggregate (${groupThousands(stages)} ${stages === 1 ? 'stage' : 'stages'})`,
    chart: (type: string) => `${type} chart`,
  },
  languages: 'Language',
  program: { label: 'Full program', hint: 'Imports, connection (MONGODB_URI) and printing the results' },
  copy: 'Copy',
  invalid: (reason: string) => `Invalid query: ${reason}`,
  filterNotObject: 'Filter must be an object',
  projectNotObject: 'Project must be an object',
  sortNotObject: 'Sort must be an object',
  copyPlan: 'Copy code',
  copyStep: (language: string, collection: string) => `copy the ${language} code of ${collection} to the clipboard`,
  copied: 'Copied to the clipboard',
  show: {
    plan: (collection: string) => `Show the Code section of ${collection}`,
    step: (collection: string) => `show the Code section of ${collection}`,
  },
  nothingRecorded: 'Nothing is written to a deployment, so nothing is recorded.',
  commands: { show: 'Code', copy: 'Copy code' },
};
