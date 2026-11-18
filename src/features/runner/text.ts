/**
 * The text of the interface of the runner area, word for word from its cards (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** The texts of the runner's dialogs, notifications, work in progress and Log. */
export const runnerText = {
  cancel: 'Cancel',
  cancelled: 'Cancelled',
  close: 'Close',
  details: 'Details',
  copy: 'Copy',
  copied: 'Copied',
  showInLog: 'Show in log',
  reconnect: 'Reconnect',
  dismiss: 'Dismiss',
  notifications: 'Notifications',
  canBeUndone: 'It can be undone from the Undo history.',
  ifThisFails: 'if this fails:',
  ifThisFailsGoOn: 'if this fails: the next step runs',
  alreadySent: 'Already sent to the server.',
  needsAPerson: 'A tool of the MCP server cannot answer a question.',
  filter: 'Filter',
  workInProgress: 'Work in progress',
  log: 'Log',
  follow: 'Follow',
  clear: 'Clear',
  export: 'Export…',
  logFilter: 'Filter the Log',
  allSources: 'All sources',
  allConnections: 'All connections',
  allKinds: 'All kinds',
  kindSteps: 'Steps',
  kindRefusals: 'Refusals',
  kindErrors: 'Errors',
  emptyLog: 'Nothing has run yet.',
  noLineMatches: 'No line matches.',
  logLines: 'Lines of the Log',
  noChoiceMatches: 'Nothing matches.',
  readOnly: (connection: string): string => `The connection ${connection} is read-only.`,
  isView: (name: string): string => `${name} is a view: it cannot be written to.`,
  notConnected: (connection: string): string => `${connection} is not connected.`,
  stoppedAt: (step: number, of: number): string => `Stopped at step ${String(step)} of ${String(of)}.`,
  stoppedAfter: (step: number, of: number): string => `Stopped after step ${String(step)} of ${String(of)}.`,
  stepsFailed: (title: string, steps: readonly string[]): string =>
    `${title}: ${steps.length === 1 ? 'this step' : 'these steps'} failed: ${steps.join('; ')}.`,
  andMore: (count: number): string => `and ${groupThousands(count)} more`,
  typeToConfirm: (name: string): string => `Type ${name} to confirm`,
  tasksRunning: (count: number): string => `${String(count)} ${count === 1 ? 'task' : 'tasks'} running`,
  progress: (done: number, total: number, unit: string): string =>
    `${groupThousands(done)} of ${groupThousands(total)} ${unit}`,
  times: (count: number): string => `×${String(count)}`,
  filterChoices: (label: string): string => `Filter ${label.toLowerCase()}`,
} as const;
