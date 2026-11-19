/**
 * Feature: gridfs.inspect
 *
 * The selected file in the inspector island: its name, size, date and type; **Open**, **Download…**, and on a
 * connection that is not read-only **Rename…** and **Delete**; **Edit metadata** (**Show document** on a read-only
 * connection), **Copy _id** and **Copy name**; the preview of `gridfs.preview`; and the files document in mongosh
 * syntax. The preview is read when a file is selected for the first time and kept until **Refresh** or a change of
 * the bucket made from the page. An image is drawn as a picture of its type, an SVG among them, where nothing runs and
 * nothing is loaded (T20). Ported from Mongoster's `detail`.
 */
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { localDateText } from '../key/format-expiry';
import type { Preview } from './preview';
import { fileControls } from './show';
import { sizeText } from './size-text';
import { text } from './text';
import { fileArgs, startControl, type BucketPlace, type GridControl, type GridFile } from './types';

/** What the inspector is drawn from: the file selected, as the page read it, and its preview. */
export interface GridInspectState {
  readonly place: BucketPlace;
  readonly file: GridFile;
  /** `undefined` while it is read. */
  readonly preview?: Preview;
}

/** How the preview is shown. */
export type PreviewView =
  | { readonly kind: 'loading'; readonly text: string }
  /** A picture of its type, drawn from its bytes, with the file name as its description. */
  | { readonly kind: 'image'; readonly source: string; readonly description: string }
  /** A text in a fixed-width font, with the note under it when it was cut. */
  | { readonly kind: 'text'; readonly text: string; readonly note?: string }
  | { readonly kind: 'binary'; readonly title: string; readonly hex: string }
  | { readonly kind: 'message'; readonly text: string };

/** What the inspector shows. */
export interface GridInspectView {
  readonly heading: string;
  readonly facts: readonly string[];
  readonly buttons: readonly GridControl[];
  readonly document: GridControl;
  readonly copies: readonly GridControl[];
  readonly preview: PreviewView;
  readonly filesDocument: { readonly label: string; readonly text: string };
}

/** The preview as the inspector draws it. */
export function previewView(preview: Preview | undefined, filename: string): PreviewView {
  if (preview === undefined) {
    return { kind: 'loading', text: text.inspector.loading };
  }
  switch (preview.kind) {
    case 'gone':
    case 'too-large':
      return { kind: 'message', text: preview.message };
    case 'image':
      return { kind: 'image', source: `data:${preview.contentType};base64,${preview.base64}`, description: filename };
    case 'text':
      return preview.note === undefined
        ? { kind: 'text', text: preview.text }
        : { kind: 'text', text: preview.text, note: preview.note };
    case 'binary':
      return { kind: 'binary', title: preview.title, hex: preview.hex };
  }
}

/** Feature: gridfs.inspect — what the inspector shows of the selected file. */
export function view(state: GridInspectState): GridInspectView {
  const { place, file } = state;
  const facts = [
    sizeText(file.length),
    ...(file.uploadDate === undefined ? [] : [localDateText(file.uploadDate)]),
    ...(file.contentType === undefined ? [] : [file.contentType]),
  ];
  return {
    heading: file.filename,
    facts,
    buttons: fileControls(place, file, 'inspector'),
    document: startControl(
      place.readOnly ? text.inspector.showDocument : text.inspector.editMetadata,
      {
        element: 'gridfs.edit-metadata@inspector',
        feature: 'gridfs.edit-metadata',
        tooltip: text.inspector.documentTooltip,
      },
      place,
      fileArgs(file),
    ),
    copies: [
      { kind: 'copy', label: text.inspector.copyId, text: file.idText },
      { kind: 'copy', label: text.inspector.copyName, text: file.filename },
    ],
    preview: previewView(state.preview, file.filename),
    filesDocument: {
      label: text.inspector.filesDocument,
      text: formattedValue(file.document, { kind: 'pretty', width: prettyWidth }),
    },
  };
}
