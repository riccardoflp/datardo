/**
 * The text of the interface of the GridFS area, word for word from the cards of `docs/features/gridfs.md` (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** `1,234 files`, `1 file`. */
function files(count: number): string {
  return `${groupThousands(count)} ${count === 1 ? 'file' : 'files'}`;
}

/** The texts of the GridFS area. */
export const text = {
  page: {
    filter: 'Filter by name, or { metadata.contentType: "image/png" }',
    summary: (count: number, size: string) => `${files(count)} · ${size}`,
    upload: 'Upload…',
    uploadTooltip: 'Upload files from disk',
    refresh: 'Refresh',
    refreshTooltip: 'Reload the files',
    columns: { name: 'Name', size: 'Size', uploaded: 'Uploaded', type: 'Type', metadata: 'Metadata', id: '_id' },
    sizeTooltip: (bytes: number, chunk: string) => `${groupThousands(bytes)} bytes · chunks of ${chunk}`,
    previous: '‹ Previous',
    next: 'Next ›',
    range: (first: number, last: number, total: number) =>
      `${groupThousands(first)}–${groupThousands(last)} of ${groupThousands(total)}`,
    noMatch: 'No file matches the filter.',
    empty: 'The bucket is empty: Upload… adds files.',
    emptyReadOnly: 'The bucket is empty.',
    readOnly: 'Read-only',
    readOnlyTooltip: "The connection is read-only: files can't be uploaded, renamed or deleted",
    openPlan: 'Open GridFS bucket',
  },
  menu: {
    open: 'Open',
    openTooltip: "Open the file with the system's application (a temporary copy)",
    download: 'Download…',
    downloadTooltip: 'Save the file to disk',
    rename: 'Rename…',
    delete: 'Delete',
    deleteTooltip: 'Delete the file and its chunks',
  },
  inspector: {
    editMetadata: 'Edit metadata',
    showDocument: 'Show document',
    documentTooltip: 'Open the files document in a document tab; saving it writes it back',
    copyId: 'Copy _id',
    copyName: 'Copy name',
    filesDocument: 'Files document',
    loading: 'Loading the preview…',
    cut: (shown: string, size: string) => `The first ${shown} of ${size}: Open shows the whole file.`,
    binary: 'Binary file',
    binaryCut: (bytes: number) => `Binary file: the first ${groupThousands(bytes)} bytes`,
    tooLarge: (most: string) => `The image is larger than ${most}: Open shows it.`,
  },
  gone: 'The file no longer exists.',
  readOnly: (connection: string) => `The connection ${connection} is read-only: files can't be changed.`,
  readOnlyBucket: (connection: string) => `The connection ${connection} is read-only.`,
  filterError: (message: string) => `Filter: ${message}`,
  upload: {
    dialog: (where: string) => `Upload files to ${where}`,
    button: 'Upload',
    existingTitle: (names: readonly string[], where: string) =>
      `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${groupThousands(names.length - 3)} more` : ''} already in ${where}`,
    existing: 'Names that exist',
    revision: 'Add a new revision',
    revisionNote: 'GridFS keeps both; reading by name gives the newest',
    replace: 'Replace',
    replaceNote: 'delete the files with the same name once the new one is uploaded',
    skip: 'Skip',
    skipNote: 'upload only the new names',
    plan: (where: string) => `Upload files to ${where}`,
    replaceQuestion: (count: number, where: string) => `Replace ${files(count)} in ${where}?`,
    replaceDetail:
      "The files with these names are deleted, with all their revisions, once the new ones are uploaded. This can't be undone.",
    undo: 'It cannot be undone from the undo history: GridFS files are not recorded. A file uploaded by mistake is deleted with Delete; a file replaced is gone.',
    progressTitle: (where: string) => `Uploading to ${where}`,
    progress: (at: { name: string; index: number; count: number; done: string; total: string }) =>
      `${at.name} (${groupThousands(at.index)} of ${groupThousands(at.count)}) · ${at.done} of ${at.total}`,
    uploaded: (count: number, size: string, where: string, more: { skipped: number; cancelled: boolean }) =>
      `Uploaded ${files(count)} (${size}) to ${where}${more.skipped > 0 ? `, skipped ${groupThousands(more.skipped)} that already existed` : ''}${more.cancelled ? ', cancelled' : ''}.`,
    chunks: (count: number) => `×${groupThousands(count)}`,
    open: 'Open',
    nothing: 'Upload nothing',
  },
  createBucket: {
    title: (where: string) => `Upload files to GridFS in ${where}`,
    note: (bucket: string) => `Bucket name: its files go in ${bucket}.files and ${bucket}.chunks`,
    name: 'Bucket name',
    button: 'Choose files…',
    badName: 'Enter a name without spaces or $',
  },
  download: {
    dialog: (name: string) => `Download ${name}`,
    plan: (name: string) => `Download ${name}`,
    progress: (name: string) => `Downloading ${name}`,
    done: (name: string, size: string, path: string) => `Downloaded ${name} (${size}) to ${path}.`,
    cancelled: 'Download cancelled.',
    undo: 'It cannot be undone from the undo history: it writes a file on the disk, which the user deletes.',
  },
  open: {
    plan: (name: string) => `Open ${name}`,
    step: "open the copy with the system's application",
    progress: (name: string) => `Opening ${name}`,
    type: "Datardo doesn't open files of this type: download it instead.",
    undo: 'It cannot be undone from the undo history: it writes a temporary copy, deleted when Datardo quits.',
  },
  rename: {
    title: (name: string) => `Rename ${name}`,
    name: 'Name',
    button: 'Rename',
    empty: 'Enter a name',
    plan: (from: string, to: string) => `Rename ${from} to ${to}`,
    renamed: (from: string, to: string) => `Renamed ${from} to ${to}.`,
    undo: 'It cannot be undone from the undo history: GridFS files are not recorded. Renaming it back reverses it.',
  },
  editMetadata: {
    plan: 'Open the files document',
  },
  deleteFile: {
    question: (name: string, size: string, where: string) => `Delete ${name} (${size}) from ${where}?`,
    detail: "Its chunks are deleted too. This can't be undone.",
    button: 'Delete',
    plan: (name: string) => `Delete ${name}`,
    deleted: (name: string) => `Deleted ${name}.`,
    undo: 'It cannot be undone from the undo history: GridFS files are not recorded. Download the file first to keep it.',
  },
  dropBucket: {
    question: (where: string, count: number) =>
      `Delete the GridFS bucket ${where} and its ${count === 1 ? '1 file' : files(count)}?`,
    detail: (bucket: string) => `Drops ${bucket}.files and ${bucket}.chunks. This can't be undone.`,
    button: 'Delete',
    plan: (where: string) => `Delete the GridFS bucket ${where}`,
    dropped: (where: string) => `Deleted the GridFS bucket ${where}.`,
    undo: 'It cannot be undone from the undo history: GridFS files are not recorded, and a dropped collection is not a write to documents. A backup of the database is the way to keep the files.',
  },
  commands: {
    show: 'Open GridFS bucket',
    upload: 'Upload files to GridFS…',
    createBucket: 'Upload files to GridFS…',
    download: 'Download file…',
    open: 'Open file',
    rename: 'Rename file…',
    editMetadata: 'Edit metadata',
    delete: 'Delete file',
    dropBucket: 'Delete GridFS bucket…',
  },
} as const;
