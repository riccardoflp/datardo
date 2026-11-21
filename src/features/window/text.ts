/**
 * The text of the interface of the window area, word for word as its cards write it (R10.1).
 */

/** Datardo's name, as the window, the top bar and About write it. */
export const appName = 'Datardo';

/** The texts of the window area. */
export const windowText = {
  goToLabel: 'Go to',
  goToPlaceholder: 'Go to a collection, a key, a page or a command',
  goToKey: 'Ctrl+K',
  minimize: 'Minimize',
  maximize: 'Maximize',
  restore: 'Restore',
  close: 'Close',
  exitFullScreen: 'Exit full screen',
  enterFullScreen: 'Enter full screen',
  trayTooltip: 'Datardo: scheduled tasks keep running',
  trayOpen: 'Open Datardo',
  trayTasks: 'Scheduled tasks',
  trayQuit: 'Quit',
  quitTitle: 'Quit Datardo',
  quitQuestion: 'Quit Datardo?',
  quitConfirmText: 'Work that is cancelled stops where it is: what it has already written stays.',
  quitButton: 'Quit',
  aboutTitle: 'About Datardo',
  aboutClient: 'MongoDB and Redis client.',
  aboutDataFolder: 'Data folder',
  aboutOpen: 'Open',
  aboutDocumentation: 'Documentation',
  aboutReportIssue: 'Report an issue',
  aboutCheck: 'Check for updates',
  aboutDownload: 'Download',
  aboutCopy: 'Copy',
  aboutCopied: 'Copied',
  aboutClose: 'Close',
  onlyWebLinks: 'Datardo opens only web links.',
  nothingRecorded: 'Nothing is written to a deployment, so nothing is recorded.',
} as const;

/** The line of the runtime About shows: `Electron 44.1.0, Chromium 140.0.0.0, Node.js 24.1.0.` */
export function runtimeLine(runtime: {
  readonly electron: string;
  readonly chromium: string;
  readonly node: string;
}): string {
  return `Electron ${runtime.electron}, Chromium ${runtime.chromium}, Node.js ${runtime.node}.`;
}

/** The message when the data folder cannot be opened, with its path so that it can be copied. */
export function folderNotOpened(path: string): string {
  return `The data folder could not be opened: ${path}.`;
}
