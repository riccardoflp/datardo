/**
 * The text of the interface of the aggregate area, word for word as its cards write it (R10.1).
 */

function stages(count: number): string {
  return `${String(count)} ${count === 1 ? 'stage' : 'stages'}`;
}

/** The text of the aggregate area. */
export const text = {
  editor: {
    empty:
      'No stages: the pipeline returns the documents unchanged. Add a stage, paste a pipeline with "Edit as text", or drag a cell here.',
    addStage: 'Add a stage at the end',
    addStageEmpty: 'Add a stage',
    showUpTo: 'Show the output up to this stage',
    previewing: 'Previewing this stage — click to show the full pipeline',
    name: 'Stage operator',
    enabled: 'Enabled (uncheck to skip this stage)',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    remove: 'Remove stage',
    disable: 'Disable stage',
    enable: 'Enable stage',
    body: (number: number) => `Body of stage ${String(number)}`,
    textHint: '[ { $match: { field: "value" } }, { $group: { _id: "$field", n: { $sum: 1 } } } ]',
    textLabel: 'Pipeline as text',
  },
  toolbar: {
    run: 'Run',
    clear: 'Clear',
    explain: 'Explain',
    saveAsView: 'Save as view…',
    editAsText: 'Edit as text',
    editAsStages: 'Edit as stages',
    copy: 'Copy',
    code: 'Code',
  },
  line: {
    enabled: (enabled: number, all: number) => `${String(enabled)} of ${stages(all)} enabled`,
    shown: (number: number, name: string) => `Output of stage ${String(number)} (${name}) · `,
    showFull: 'show full pipeline',
    textDisabled: ' · disabled stages are not shown in text',
  },
  marks: {
    writes: 'writes',
    mustBeFirst: 'must be first',
    mustBeFirstWhy:
      'Atlas Search stages ($search, $searchMeta, $vectorSearch) only work as the first stage of the pipeline',
    invalidName: 'The name is not a stage operator',
    invalidBody: 'The body does not parse',
    error: 'The last run stopped on this stage',
    disabled: 'disabled',
    skipped: 'not sent: after the stage shown',
    shown: 'the stage shown',
  },
  drop: {
    into: (number: number) => `Drop to add the condition into $match (stage ${String(number)})`,
    after: (number: number) => `Drop to add the condition as a new $match after stage ${String(number)}`,
    asNew: 'Drop to add the condition as a new $match stage',
  },
  results: {
    noDocuments: 'The pipeline returned no documents.',
    written: (name: string, target: string) => `Pipeline output written by ${name} to ${target}.`,
    cancelled: (name: string) => `Not run: the ${name} stage was cancelled.`,
    copied: 'Copied to the clipboard',
    createdView: (name: string) => `Created view ${name}.`,
    openView: 'Open view',
  },
  summary: {
    empty: 'empty pipeline',
    separator: ' → ',
  },
  errors: {
    invalidPipeline: (reason: string) => `Invalid pipeline: ${reason}`,
    stage: (number: number, name: string, reason: string) => `Stage ${String(number)} (${name}): ${reason}`,
    notOperator: (name: string) => `${JSON.stringify(name)} is not a stage operator (e.g. $match)`,
    emptyBody: 'The stage body is empty',
    mustBeFirst: (name: string) => `${name} must be the first stage of the pipeline`,
    mustBeLast: (name: string) => `${name} must be the last stage of the pipeline`,
    stageShape: (number: number) => `Stage ${String(number)} must be an object with a single $operator key`,
    fixBeforeDrop: (number: number, reason: string) =>
      `Fix stage ${String(number)} before adding conditions by drag & drop: ${reason}`,
    notAnObject: 'must be an object',
    readOnly: (connection: string) => `The connection ${connection} is read-only.`,
    readOnlyWrites: (connection: string, name: string) =>
      `The connection ${connection} is read-only. Pipelines ending with ${name} write to the database.`,
    viewWrites: (name: string) => `A view can't contain ${name}: select an earlier stage.`,
    nameTaken: 'A collection or view with this name already exists',
    nameEmpty: 'Enter a name',
    nameDollar: 'A collection name cannot contain $',
    nameSystem: 'Names starting with "system." are reserved',
    nameDot: 'A collection name cannot start or end with a dot',
    notACollection: 'The pipeline editor works on the tab of a collection or a view.',
  },
  writeOutput: {
    title: 'Run pipeline',
    question: (name: string, target: string) => `Run this pipeline? Its ${name} stage writes to ${target}.`,
    modifies: 'This modifies the database. Select an earlier stage to preview without writing.',
    replaces: (collection: string) =>
      `It replaces the collection ${collection}: the documents it holds now are lost. Select an earlier stage to preview without writing.`,
    button: 'Run',
    cannotUndo:
      'The server writes the output itself, so Datardo never holds the documents that $out replaced or $merge changed.',
  },
  saveAsView: {
    title: 'Save pipeline as view',
    field: (collection: string, count: number) => `Name of the view on ${collection} (${stages(count)})`,
    label: 'Name of the view',
    button: 'Save',
    plan: 'Save pipeline as view',
    cannotUndo: 'The view is removed with Drop, which loses no documents.',
  },
  plans: {
    addStage: 'Add stage',
    removeStage: 'Remove stage',
    moveStage: 'Move stage',
    disableStage: 'Disable stage',
    enableStage: 'Enable stage',
    clear: 'Clear pipeline',
    showStage: 'Show the output after a stage',
    editAsText: 'Edit pipeline as text',
    editAsStages: 'Edit pipeline as stages',
    copy: 'Copy pipeline',
    dropCondition: 'Drop a condition into the pipeline',
    sortColumn: 'Sort the output',
    run: 'Run pipeline',
  },
  steps: {
    add: (name: string, collection: string) => `add the stage ${name} to the pipeline of ${collection}`,
    remove: (number: number, name: string, collection: string) =>
      `remove stage ${String(number)} (${name}) from the pipeline of ${collection}`,
    move: (number: number, name: string, collection: string, place: number) =>
      `move stage ${String(number)} (${name}) of the pipeline of ${collection} to place ${String(place)}`,
    disable: (number: number, name: string, collection: string) =>
      `disable stage ${String(number)} (${name}) of the pipeline of ${collection}`,
    enable: (number: number, name: string, collection: string) =>
      `enable stage ${String(number)} (${name}) of the pipeline of ${collection}`,
    clear: (collection: string) => `remove every stage from the pipeline of ${collection}`,
    show: (number: number, name: string, collection: string) =>
      `show the output of stage ${String(number)} (${name}) of the pipeline of ${collection}`,
    showWhole: (collection: string) => `show the output of the whole pipeline of ${collection}`,
    asText: (collection: string) => `show the pipeline of ${collection} as text`,
    asStages: (collection: string) => `show the pipeline of ${collection} as stages`,
    copy: (collection: string) => `copy the pipeline of ${collection} to the clipboard`,
    addInto: (condition: string, number: number, name: string, collection: string) =>
      `add ${condition} to stage ${String(number)} (${name}) of the pipeline of ${collection}`,
    insertAfter: (stage: string, number: number, collection: string) =>
      `add the stage ${stage} after stage ${String(number)} of the pipeline of ${collection}`,
    insertFirst: (stage: string, collection: string) => `add the stage ${stage} to the pipeline of ${collection}`,
    setBody: (number: number, name: string, collection: string, body: string) =>
      `set stage ${String(number)} (${name}) of the pipeline of ${collection} to ${body}`,
  },
  commands: {
    addStage: 'Add stage',
    moveLeft: 'Move stage left',
    moveRight: 'Move stage right',
    clear: 'Clear pipeline',
    editAsText: 'Edit pipeline as text',
    editAsStages: 'Edit pipeline as stages',
    copy: 'Copy pipeline',
    run: 'Run pipeline',
    saveAsView: 'Save pipeline as view…',
  },
  suggestions: {
    groupKey: 'group key',
    option: 'option',
    variable: 'variable',
    field: 'field',
  },
} as const;
