import { describe, expect, it } from 'vitest';
import * as inspect from '../../../src/features/gridfs/inspect';
import { startingSort } from '../../../src/features/gridfs/list';
import * as show from '../../../src/features/gridfs/show';
import type { BucketPlace, GridControl, GridFile } from '../../../src/features/gridfs/types';
import { contextOn, fs, gridFile, local, onFs, planOf } from './context';

const readOnlyFs: BucketPlace = { ...fs, connectionName: 'Production', readOnly: true };

function files(count: number): readonly GridFile[] {
  return Array.from({ length: count }, (_, index) =>
    gridFile({ _id: { $numberInt: String(index) }, filename: `f${String(index)}.png` }),
  );
}

function pageState(more: Partial<show.GridFsPageState> = {}): show.GridFsPageState {
  return { place: fs, filter: '', sort: startingSort, page: 0, loading: false, ...more };
}

function elementsOf(controls: readonly GridControl[]): readonly string[] {
  return controls.flatMap((control) => (control.kind === 'start' ? [control.element] : []));
}

describe('gridfs.show', () => {
  it('shows 1,234 files · 2.1 GB, the first 100 files and the pager 1–100 of 1,234', () => {
    const view = show.view(pageState({ read: { files: files(100), total: 1234, bytes: 2_254_857_830 } }));
    expect(view.toolbar.summary).toBe('1,234 files · 2.1 GB');
    expect(view.rows).toHaveLength(100);
    expect(view.pager).toEqual({
      previous: { label: '‹ Previous', enabled: false },
      range: '1–100 of 1,234',
      next: { label: 'Next ›', enabled: true },
    });
    expect(view.columns.find((column) => column.key === 'uploadDate')?.sorted).toBe('descending');
  });

  it('shows 101–200 on the second page, disables Next on the last, and has no pager for 100 files', () => {
    expect(show.pagerOf(1, 1234)?.range).toBe('101–200 of 1,234');
    expect(show.pagerOf(12, 1234)).toMatchObject({ range: '1,201–1,234 of 1,234', next: { enabled: false } });
    expect(show.pagerOf(0, 100)).toBeUndefined();
    expect(show.view(pageState({ read: { files: files(1), total: 1, bytes: 734_003 } })).toolbar.summary).toBe(
      '1 file · 717 KB',
    );
  });

  it('sorts by name ascending first, then descending, and by size the largest first', () => {
    const byName = show.nextSort(startingSort, 'filename');
    expect(byName).toEqual({ field: 'filename', descending: false });
    expect(show.nextSort(byName, 'filename')).toEqual({ field: 'filename', descending: true });
    expect(show.nextSort(byName, 'length')).toEqual({ field: 'length', descending: true });
    expect(show.filterWaitMs).toBe(300);
  });

  it('shows 717 KB and its tooltip for a file of 734,003 bytes with the driver chunk size', () => {
    const [row] = show.view(pageState({ read: { files: [gridFile()], total: 1, bytes: 734_003 } })).rows;
    expect(row).toMatchObject({ size: '717 KB', sizeTooltip: '734,003 bytes · chunks of 255 KB' });
    expect(row?.uploadedTooltip).toBe('2026-11-18T13:02:11.000Z');
    expect(row?.uploaded).toMatch(/^2026-11-18 \d\d:\d\d:11$/u);
  });

  it('shows the type and the metadata without its contentType', () => {
    const ada = gridFile({ metadata: { contentType: 'image/png', owner: 'ada' } });
    const [row] = show.view(pageState({ read: { files: [ada, gridFile()], total: 2, bytes: 0 } })).rows;
    expect(row).toMatchObject({ type: 'image/png', metadata: '{ owner: "ada" }' });
    expect(show.metadataText({ contentType: 'image/png' })).toBe('');
  });

  it('shows the error of a filter that cannot be read in place of the table', () => {
    const view = show.view(
      pageState({
        filter: '{ length: ',
        error: 'Filter: unexpected end',
        read: { files: files(3), total: 3, bytes: 0 },
      }),
    );
    expect(view).toMatchObject({ error: 'Filter: unexpected end', rows: [] });
    expect(view.pager).toBeUndefined();
  });

  it('says what an empty bucket or filter shows', () => {
    const empty = { files: [], total: 0, bytes: 0 };
    expect(show.view(pageState({ read: empty })).empty).toBe('The bucket is empty: Upload… adds files.');
    expect(show.view(pageState({ read: empty, filter: 'logo' })).empty).toBe('No file matches the filter.');
    expect(show.view(pageState({ place: readOnlyFs, read: empty })).empty).toBe('The bucket is empty.');
  });

  it('lists and downloads on a read-only connection, without Upload, Rename or Delete', () => {
    const view = show.view(pageState({ place: readOnlyFs, read: { files: files(1), total: 1, bytes: 0 } }));
    expect(view.toolbar.upload).toBeUndefined();
    expect(elementsOf(view.rows[0]?.menu ?? [])).toEqual(['gridfs.open@row-menu', 'gridfs.download@row-menu']);
    expect(view.readOnly).toEqual({
      label: 'Read-only',
      tooltip: "The connection is read-only: files can't be uploaded, renamed or deleted",
    });
    const writable = show.view(pageState({ read: { files: files(1), total: 1, bytes: 0 } }));
    expect(elementsOf(writable.rows[0]?.menu ?? [])).toEqual([
      'gridfs.open@row-menu',
      'gridfs.download@row-menu',
      'gridfs.rename@row-menu',
      'gridfs.delete@row-menu',
    ]);
    expect(writable.toolbar.upload).toMatchObject({ element: 'gridfs.upload@toolbar', args: { from: 'page' } });
  });

  it('opens the tab of the bucket', () => {
    const plan = planOf(show.plan(contextOn('gridfs.show'), onFs()));
    expect(plan.steps[0]).toMatchObject({
      action: 'tab.open',
      args: {
        shows: { kind: 'page', connection: local.id, page: 'gridfs', title: 'fs', database: 'shop', of: ['fs'] },
      },
    });
  });
});

describe('gridfs.inspect', () => {
  it('shows the image of logo.png, with its name as its description', () => {
    const view = inspect.view({
      place: fs,
      file: gridFile(),
      preview: { kind: 'image', contentType: 'image/png', base64: 'iVBO' },
    });
    expect(view.preview).toEqual({ kind: 'image', source: 'data:image/png;base64,iVBO', description: 'logo.png' });
    expect(view.heading).toBe('logo.png');
    expect(view.facts[0]).toBe('717 KB');
  });

  it('shows Loading the preview… while it is read, and the note of a text cut', () => {
    expect(inspect.view({ place: fs, file: gridFile() }).preview).toEqual({
      kind: 'loading',
      text: 'Loading the preview…',
    });
    const note = 'The first 256 KB of 3.2 MB: Open shows the whole file.';
    expect(inspect.previewView({ kind: 'text', text: 'a', cut: true, note }, 'data.json')).toEqual({
      kind: 'text',
      text: 'a',
      note,
    });
  });

  it('copies the ObjectId of the file in mongosh syntax', () => {
    const view = inspect.view({ place: fs, file: gridFile() });
    expect(view.copies[0]).toEqual({ kind: 'copy', label: 'Copy _id', text: 'ObjectId("65f1c0ffee0000000000a2c1")' });
    expect(view.filesDocument.text).toContain('filename: "logo.png"');
  });

  it('shows Show document and neither Rename nor Delete on a read-only connection', () => {
    const view = inspect.view({ place: readOnlyFs, file: gridFile() });
    expect(view.document).toMatchObject({ label: 'Show document', element: 'gridfs.edit-metadata@inspector' });
    expect(elementsOf(view.buttons)).toEqual(['gridfs.open@inspector', 'gridfs.download@inspector']);
    expect(inspect.view({ place: fs, file: gridFile() }).document).toMatchObject({ label: 'Edit metadata' });
  });

  it('says the file no longer exists', () => {
    expect(inspect.previewView({ kind: 'gone', message: 'The file no longer exists.' }, 'x')).toEqual({
      kind: 'message',
      text: 'The file no longer exists.',
    });
  });
});
