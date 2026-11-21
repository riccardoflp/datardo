/**
 * The text of the interface of the relation area, word for word from its cards (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

function plural(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

/** The texts of the relation area. */
export const text = {
  commands: {
    diagram: 'Relationship diagram',
    openReferenced: 'Open referenced document',
  },
  relation: {
    view: (view: string, collection: string): string => `${view} is a view of ${collection}`,
    manyToOne: 'many-to-one',
    manyToMany: 'many-to-many (an array of references)',
    dbref: 'DBRef',
    found: (found: number, lookedUp: number): string => `${String(found)} of ${String(lookedUp)} sampled values found`,
  },
  progress: {
    sampling: (collections: number): string => `Sampling ${plural(collections, 'collection', 'collections')}…`,
    sampled: (done: number, collections: number): string =>
      `Sampled ${groupThousands(done)} of ${groupThousands(collections)} collections…`,
    checking: (candidates: number, collections: number): string =>
      `Checking ${plural(candidates, 'possible reference', 'possible references')} in ${plural(collections, 'collection', 'collections')}…`,
  },
  mcp: {
    notFound: (database: string, collection: string, connection: string): string =>
      `${database}.${collection} doesn't exist on ${connection}: use list_collections.`,
    unreadable: (collection: string, message: string): string => `Not readable: ${collection}: ${message}`,
    none: 'No field of the sampled documents refers to another collection.',
  },
  diagram: {
    page: 'Relationship diagram',
    /** The name of the second row of the toolbar for the accessibility tree. */
    viewRow: 'Zoom and export',
    title: (database: string): string => `Diagram: ${database}`,
    collections: (count: number): string => plural(count, 'collection', 'collections'),
    relations: (count: number): string => plural(count, 'relation', 'relations'),
    views: (count: number): string => plural(count, 'view', 'views'),
    sampledPer: (sample: number): string => `${groupThousands(sample)} documents sampled per collection`,
    sample: 'Sample',
    sampleHint: 'Documents read per collection to find the fields and the references',
    keysOnly: 'Keys only',
    keysOnlyHint: 'Show only _id, unique fields and the fields of the relations',
    refresh: 'Refresh',
    refreshHint: 'Sample the collections again',
    zoomOut: '−',
    zoomOutHint: 'Zoom out',
    zoomIn: '+',
    zoomInHint: 'Zoom in',
    fit: 'Fit',
    fitHint: 'Fit the diagram in the tab',
    resetLayout: 'Reset layout',
    resetLayoutHint: 'Put the collections back where the automatic layout places them',
    copyMermaid: 'Copy Mermaid',
    copyMermaidHint: 'Copy the diagram as a Mermaid erDiagram (for Markdown, GitHub, docs)',
    saveSvg: 'Save SVG…',
    saveSvgHint: 'Save the diagram as an SVG image',
    list: (count: number): string => `Relations (${String(count)})`,
    noRelations: 'No field of the sampled documents refers to another collection.',
    empty: (database: string): string => `${database} has no collections.`,
    loading: 'Sampling the collections…',
    documents: (count: number): string => `${groupThousands(count)} docs`,
    view: 'view',
    moreFields: (count: number): string => `+${groupThousands(count)} more fields`,
    emptyBox: 'empty, or not readable',
    severalMark: 'N',
    share: (percent: number): string => `in ${String(percent)}% of the sampled documents`,
    selectStep: (collection: string, database: string): string => `select ${collection} in the diagram of ${database}`,
    sampleStep: (database: string, size: number): string =>
      `sample the collections of ${database}, ${groupThousands(size)} documents each`,
    nothingWritten: 'Nothing is written to a deployment.',
  },
  copied: 'Copied to the clipboard',
  mermaid: {
    title: 'Copy Mermaid',
    step: (database: string): string => `copy the Mermaid diagram of ${database} to the clipboard`,
    nothingWritten: 'Nothing is written to a deployment.',
  },
  svg: {
    title: 'Save SVG',
    dialog: 'Save the diagram',
    kind: 'SVG image',
    name: (database: string): string => `${database}-diagram.svg`,
    nothingWritten: 'Nothing is written to a deployment; the file can be deleted.',
    saved: (database: string, path: string): string => `Saved the diagram of ${database} to ${path}.`,
    open: 'Open',
    openTitle: 'Open the diagram',
    openStep: (path: string): string => `open ${path} with the system's program`,
    notSaved: (message: string): string => `Diagram not saved: ${message}`,
    viewSuffix: ' (view)',
  },
  open: {
    referencedTitle: 'Open referenced document',
    referencingTitle: 'Find referencing documents',
    pick: 'Open the referenced document in',
    pickButton: 'Open',
    step: (database: string, collection: string, filter: string): string =>
      `open ${database}.${collection} with the filter ${filter}`,
    nothingWritten: 'Nothing is written; Back returns to where you were.',
  },
  follow: {
    goFromHere: 'Go from here',
    referencedBy: 'Referenced by',
    finding: (database: string): string => `Finding the references of ${database}…`,
    empty: 'This document refers to no other, and no collection refers to its collection.',
    notDetected: (database: string): string =>
      `References are not found by themselves: the relationship diagram of ${database} finds them.`,
    diagram: 'Relationship diagram',
    openOne: (collection: string): string => `Ctrl+click: open the referenced document in ${collection}`,
    openMany: (count: number, collection: string): string =>
      `Ctrl+click: open the ${groupThousands(count)} referenced documents in ${collection}`,
    openSeveral: (collections: readonly string[]): string =>
      `Ctrl+click: open the referenced document (in ${collections.join(', ')})`,
    openReferenced: 'Open referenced document',
    openReferencedMany: 'Open referenced documents',
    severalCollections: 'The field references several collections',
    findReferencing: 'Find referencing documents',
    findReferencingHint: 'The documents of other collections (or of this one) whose fields reference this one',
  },
} as const;
