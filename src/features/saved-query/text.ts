/**
 * The text of the interface of the saved-query area, word for word as its cards write it (R10.1).
 */

function quoted(name: string): string {
  return `"${name}"`;
}

/** The text of the saved-query area. */
export const text = {
  /** What `saved-query.parse-file` says of a file, completing *Datardo skipped the saved query <file>:*. */
  file: {
    notJson: (reason: string) => `not valid JSON: ${reason}`,
    notObject: 'it must be a JSON object.',
    missing: (field: string) => `"${field}" is missing: it must be a non-empty string.`,
    notLines: (field: string, where: string) => `"${field}"${where} must be a string or an array of lines.`,
    connection: '"connection" must be a string.',
    both: 'it has both a "pipeline" and "filter", "sort" or "projection": keep one or the other.',
    pipelineNotArray: '"pipeline" must be an array of stages.',
    ofStage: (number: number) => ` of stage ${String(number)}`,
    stageNotObject: (number: number) =>
      `stage ${String(number)} of "pipeline" must be an object with "stage" and "body".`,
    stageName: (where: string) => `"stage"${where} must be a stage name such as "$match".`,
    enabled: (where: string) => `"enabled"${where} must be true or false.`,
    tooLarge: 'the file is larger than 1 MB.',
  },
  /** The warning of `saved-query.read-folder`. */
  folder: {
    skippedOne: (file: string, message: string) => `Datardo skipped the saved query ${file}: ${message}`,
    skippedMany: (count: number, file: string, message: string) =>
      `Datardo skipped ${String(count)} saved query files that aren't valid, such as ${file}: ${message}`,
    revealFile: 'Reveal file',
  },
  recent: {
    title: 'Add to the recent queries',
    add: (path: string) => `add the query to the recent queries of ${path}`,
    cannotUndo: "It changes Datardo's own data: Remove from history takes one away.",
    removeTitle: 'Remove from history',
    remove: (path: string) => `remove a query from the recent queries of ${path}`,
    removeCannotUndo: 'The query is forgotten; running it again adds it back.',
    clearQuestion: (collection: string) => `Clear the recent queries of ${collection}?`,
    clearText: 'Saved queries are kept.',
    clearButton: 'Clear',
    clear: (path: string) => `clear the recent queries of ${path}`,
    clearCannotUndo: 'The recent queries are forgotten.',
  },
  save: {
    title: 'Save query',
    titleInFolder: 'Save query in the folder',
    button: 'Save',
    name: (collection: string) => `Name for this ${collection} query`,
    enterName: 'Enter a name',
    where: 'Where',
    forMe: 'For me',
    forMeDescription: (connection: string) => `kept by Datardo, on ${connection} only`,
    inFolder: 'In the folder',
    inFolderDescription: (folder: string, namespace: string) =>
      `a file in ${folder}, shared through git, on every connection with this folder and ${namespace}`,
    inChosenFolder: 'a file in a folder you choose',
    emptyFind: 'Nothing to save: filter, sort and projection are empty.',
    emptyPipeline: 'Nothing to save: the pipeline has no stages.',
    forMeStep: (name: string, namespace: string, connection: string) =>
      `save the query ${quoted(name)} of ${namespace} for me on ${connection}`,
    replaceQuestion: (collection: string, name: string) =>
      `The folder already has a query of ${collection} named ${quoted(name)}. Replace it?`,
    replaceText: (file: string) => `Its file ${file} is overwritten.`,
    replaceButton: 'Replace',
    cannotUndo:
      'The undo history keeps documents and keys, not saved queries: a file that is replaced is lost unless the folder is versioned.',
    saved: (file: string) => `Saved ${file}`,
    couldNotSave: 'Could not save the query in the folder:',
  },
  /** The file steps, as the confirmation shows them and the Log writes them. */
  steps: {
    write: (path: string) => `write ${path}`,
    delete: (path: string) => `delete ${path}`,
    rename: (path: string, name: string) => `rename ${path} to ${name}`,
  },
  rename: {
    title: 'Rename saved query',
    button: 'Rename',
    newName: 'New name',
    enterName: 'Enter a name',
    newNameOfFile: (file: string) => `New name (the file ${file} is renamed too)`,
    takenMine: 'Another saved query of yours has this name',
    takenFolder: 'Another saved query in the folder has this name',
    forMeStep: (name: string, namespace: string, to: string) =>
      `rename the query ${quoted(name)} of ${namespace} to ${quoted(to)}`,
    cannotUndo: 'The undo history keeps documents and keys, not saved queries: renaming again puts the name back.',
    couldNotRename: 'Could not rename the query:',
  },
  delete: {
    title: 'Delete saved query',
    question: (name: string) => `Delete the saved query ${quoted(name)} from the folder?`,
    text: (file: string) => `Its file ${file} is deleted.`,
    button: 'Delete',
    forMeStep: (name: string, namespace: string, connection: string) =>
      `delete the query ${quoted(name)} of ${namespace} for me on ${connection}`,
    cannotUndo: 'A query for me is forgotten, and a file is deleted for good unless the folder is versioned.',
    couldNotDelete: 'Could not delete the query:',
  },
  move: {
    toFolderTitle: 'Move to the folder',
    toFolderDescription: 'Save it as a file in the folder, shared through git',
    toMineTitle: 'Move to my queries',
    toMineDescription: 'Keep it only for you and delete its file from the folder',
    question: (name: string) => `Move ${quoted(name)} from the folder to your queries?`,
    text: (file: string) =>
      `Its file ${file} is deleted from the folder: once the change is committed, the others no longer have it.`,
    button: 'Move',
    removeMine: (name: string, namespace: string, connection: string) =>
      `remove the query ${quoted(name)} of ${namespace} for me on ${connection}`,
    cannotUndo: 'The undo history keeps documents and keys, not saved queries: moving it back makes a new file.',
    couldNotMove: 'Could not move the query:',
  },
  reveal: {
    title: 'Reveal file',
    step: (path: string) => `reveal ${path} in the file manager`,
    cannotUndo: 'There is nothing to put back.',
    couldNotOpen: 'Could not open the file:',
  },
  chooseFolder: {
    title: (connection: string) => `Queries folder of ${connection}`,
    intro: (connection: string) =>
      `Choose the queries folder of ${connection}. Saved queries are written there as files, one per query, to be shared and versioned with git.`,
    button: 'Choose folder…',
    planTitle: 'Choose the queries folder',
    step: (connection: string) => `save the connection ${connection}`,
    chosen: (folder: string) => `Queries saved in the folder go to ${folder}.`,
    cannotUndo:
      'It changes a connection of Datardo: choosing again puts another folder, and no file is moved or deleted.',
  },
  run: {
    title: 'Run saved query',
    step: (collection: string, what: string) => `set the query of ${collection} to ${what}`,
    cannotUndo: 'It changes the query of the tab, not a deployment.',
  },
  list: {
    none: (namespace: string, connection: string) => `No saved or recent queries for ${namespace} on ${connection}.`,
  },
  show: {
    search: 'Search queries',
    saveCurrent: 'Save current',
    saved: 'Saved',
    recent: 'Recent',
    clear: 'Clear',
    empty: 'Queries you run on this collection appear here.',
    noMatch: 'No queries match your search.',
    me: 'Me',
    meTooltip: 'Saved for you, in Datardo',
    folder: 'Folder',
    folderTooltip: (file: string) => `In the folder: ${file}`,
    onlyOn: (connection: string) => `Only on the connection ${connection}`,
    more: '…',
    deleteSaved: 'Delete saved query',
    saveWithName: 'Save with a name',
    removeFromHistory: 'Remove from history',
    rename: 'Rename…',
    moveToFolder: 'Move to the folder',
    moveToMine: 'Move to my queries',
    revealFile: 'Reveal file',
    pin: 'Pin',
    delete: 'Delete',
    justNow: 'just now',
    minutesAgo: (count: number) => `${String(count)}m ago`,
    hoursAgo: (count: number) => `${String(count)}h ago`,
    daysAgo: (count: number) => `${String(count)}d ago`,
    aggregate: 'aggregate',
    emptyPipeline: 'aggregate empty pipeline',
    sort: 'sort',
    project: 'project',
  },
  /** The steps that make the pin of a saved query follow it or go with it. */
  pin: {
    follow: (pin: string, before: string, connection: string) => `pin ${pin} in place of ${before} on ${connection}`,
    remove: (pin: string, connection: string) => `unpin ${pin} on ${connection}`,
  },
  connectionList: {
    context: (namespace: string, place: string) => `${namespace} · ${place}`,
  },
  commands: {
    show: 'Queries',
    clearRecent: 'Clear recent queries',
    save: 'Save query…',
    saveInFolder: 'Save query in the folder…',
    chooseFolder: 'Choose the queries folder…',
  },
} as const;
