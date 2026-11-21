/**
 * The reads of a tab of a bucket, started through the bridge as Read features the runner carries out: a page of the
 * files (`gridfs.list`), whose reply is dropped when a newer read was sent meanwhile, and the preview of the file
 * selected (`gridfs.preview`), in its two rounds. The window keeps what they give.
 */
import { listArgsJson, pageToReadAgain, type FilesPage } from '../../../features/gridfs/list';
import { chunksRoundArgs, type Preview, type PreviewRead } from '../../../features/gridfs/preview';
import { bucketArgs, bucketTarget, type GridFile } from '../../../features/gridfs/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import { changeTab, gridFsTabOf, type GridFsTab } from './gridfs-store';

function read(state: GridFsTab, feature: string, args: Json, place: Place): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target: bucketTarget(state.place), place, args });
}

function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

/** The selection after a read: kept when its file is still on the page. */
function selectedAfter(selected: string | undefined, page: FilesPage): string | undefined {
  return selected !== undefined && page.files.some((file) => file.idText === selected) ? selected : undefined;
}

/**
 * Reads the page the tab asks for now. The rows read before stay, dimmed, while it is read; a page beyond the end
 * (files were deleted meanwhile) is read again as the last page.
 */
export async function readFiles(tab: string): Promise<void> {
  let asked = 0;
  changeTab(tab, (state) => {
    asked = state.asked + 1;
    return { ...state, asked, loading: true };
  });
  const state = gridFsTabOf(tab);
  if (state === undefined) {
    return;
  }
  const args = listArgsJson({ ...state.place, filter: state.filter, sort: state.sort, page: state.page });
  const result = await read(state, 'gridfs.list', args, 'toolbar');
  if (gridFsTabOf(tab)?.asked !== asked) {
    return;
  }
  if (result.kind !== 'read') {
    changeTab(tab, (now) => {
      const { read: _read, selected: _selected, ...rest } = now;
      return { ...rest, loading: false, error: messageOf(result) };
    });
    return;
  }
  const page = result.result as FilesPage;
  const again = pageToReadAgain(state.page, page);
  if (again !== undefined) {
    changeTab(tab, (now) => ({ ...now, page: again }));
    await readFiles(tab);
    return;
  }
  changeTab(tab, (now) => {
    const { error: _error, selected: _selected, ...rest } = now;
    const selected = selectedAfter(now.selected, page);
    return { ...rest, read: page, loading: false, ...(selected === undefined ? {} : { selected }) };
  });
}

/** What the inspector shows when the preview could not be read: the error, as it is. */
function failedPreview(result: IntentResult): Preview {
  return { kind: 'gone', message: messageOf(result) };
}

/** The previews being read, by tab and file: a file selected again meanwhile is not read twice. */
const previewsRead = new Set<string>();

/** Reads the preview of a file, in its two rounds: the files document as it is now, then the chunks it needs. */
export async function readPreview(tab: string, file: GridFile): Promise<void> {
  const state = gridFsTabOf(tab);
  const key = `${tab} ${file.idText}`;
  if (state === undefined || previewsRead.has(key)) {
    return;
  }
  previewsRead.add(key);
  try {
    await readPreviewOf(tab, state, file);
  } finally {
    previewsRead.delete(key);
  }
}

async function readPreviewOf(tab: string, state: GridFsTab, file: GridFile): Promise<void> {
  const args = { ...bucketArgs(state.place), id: file.id };
  const first = await read(state, 'gridfs.preview', args, 'inspector');
  let answer: PreviewRead | undefined = first.kind === 'read' ? (first.result as PreviewRead) : undefined;
  let failed = first;
  if (answer?.kind === 'chunks') {
    const second = await read(state, 'gridfs.preview', chunksRoundArgs(args, answer.file), 'inspector');
    answer = second.kind === 'read' ? (second.result as PreviewRead) : undefined;
    failed = second;
  }
  const preview = answer?.kind === 'preview' ? answer.preview : failedPreview(failed);
  changeTab(tab, (now) => ({ ...now, previews: new Map([...now.previews, [file.idText, preview]]) }));
}
