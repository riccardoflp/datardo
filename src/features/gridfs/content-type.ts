/**
 * Feature: gridfs.content-type
 *
 * The content type of a file name: the type an upload writes in the metadata, and the type a preview assumes when
 * the files document has none. The extension is what follows the last dot of the name, whatever its case; a name
 * without a dot, one that only starts with a dot, and an extension that is not in the table have no type. Ported from
 * Mongoster's `MIME` and `contentTypeOf`.
 */

/** The types by extension, as the card's table lists them. */
const types: Readonly<Record<string, string>> = {
  txt: 'text/plain',
  log: 'text/plain',
  ts: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  wav: 'audio/wav',
};

/** The extension of a name, in lower case, without its dot: `png` of `logo.PNG`; `undefined` when it has none. */
export function extensionOf(filename: string): string | undefined {
  const dot = filename.lastIndexOf('.');
  return dot <= 0 || dot === filename.length - 1 ? undefined : filename.slice(dot + 1).toLowerCase();
}

/** Feature: gridfs.content-type — the type of a file name: `image/png` for `logo.PNG`; `undefined` for none. */
export function contentTypeOf(filename: string): string | undefined {
  const extension = extensionOf(filename);
  return extension === undefined || !Object.hasOwn(types, extension) ? undefined : types[extension];
}
