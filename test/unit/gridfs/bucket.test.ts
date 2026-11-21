import { describe, expect, it } from 'vitest';
import * as createBucket from '../../../src/features/gridfs/create-bucket';
import * as dropBucket from '../../../src/features/gridfs/drop-bucket';
import * as upload from '../../../src/features/gridfs/upload';
import { chunkCount, chunkLength, existingRead } from '../../../src/features/gridfs/write/upload';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Outcome } from '../../../src/shared/feature';
import { initialState, type AppState } from '../../../src/shared/state';
import type { Tab } from '../../../src/shared/state/tabs';
import { tabId } from '../../../src/shared/ids';
import { stateWith } from '../connection/context';
import {
  contextOn,
  local,
  mongoRequests,
  now,
  onFs,
  planOf,
  production,
  questionOf,
  recorded,
  refusalOf,
  sentRequests,
  stepTexts,
} from './context';

function chosen(name: string, size: number, hex: string): Json {
  return { path: `C:\\Users\\ada\\${name}`, name, size, id: { $oid: hex } };
}

const logo = chosen('logo.png', 734_003, '65f1c0ffee0000000000b001');

function uploadWith(answers: Answers, args: Readonly<Record<string, Json>> = {}): Outcome {
  return upload.plan(contextOn('gridfs.upload'), { ...onFs(args), ...answers });
}

describe('gridfs.upload', () => {
  it('asks for the files in the system dialog titled Upload files to Local › shop › fs', () => {
    expect(uploadWith({})).toEqual({
      kind: 'read',
      need: {
        key: 'files',
        read: 'gridfs.download:file',
        args: { mode: 'open', title: 'Upload files to Local › shop › fs', button: 'Upload', many: true },
      },
    });
  });

  it('reads the names that exist among those chosen, and whether the bucket is empty', () => {
    const outcome = uploadWith({ files: [logo, logo] });
    expect(outcome).toMatchObject({ kind: 'read', need: { key: 'existing', read: 'gridfs.upload:existing' } });
    const args = outcome.kind === 'read' ? outcome.need.args : null;
    const [distinct, first] = mongoRequests(existingRead.request(contextOn('gridfs.upload'), args));
    expect(distinct).toMatchObject({
      method: 'distinct',
      arguments: ['filename', { filename: { $in: ['logo.png'] } }],
    });
    expect(first).toMatchObject({ method: 'findOne', arguments: [{}, { projection: { _id: { $numberInt: '1' } } }] });
    expect(existingRead.parse([['logo.png'], null], args)).toEqual({ names: ['logo.png'], empty: true });
    expect(existingRead.parse([recorded('distinct-names'), recorded('findOne')], args)).toEqual({
      names: ['notes.txt'],
      empty: false,
    });
  });

  it('creates the two indexes of an empty bucket, writes 3 chunks and one files document for logo.png', () => {
    const plan = planOf(uploadWith({ files: [logo], existing: { names: [], empty: true } }));
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(stepTexts(plan)).toEqual([
      'check the files on the disk: logo.png',
      'db.getCollection("fs.files").createIndex({ filename: 1, uploadDate: 1 })',
      'db.getCollection("fs.chunks").createIndex({ files_id: 1, n: 1 }, { unique: true })',
      'db.getCollection("fs.chunks").insertOne({ files_id: ObjectId("65f1c0ffee0000000000b001"), n: 0, data: BinData(0, "…") }) ×3',
      expect.stringMatching(
        /^db\.getCollection\("fs\.files"\)\.insertOne\(\{ _id: ObjectId\("65f1c0ffee0000000000b001"\)/u,
      ) as string,
    ]);
    expect(sentRequests(plan)[2]?.arguments[0]).toEqual({
      _id: { $oid: '65f1c0ffee0000000000b001' },
      length: { $numberLong: '734003' },
      chunkSize: { $numberInt: '261120' },
      uploadDate: { $date: { $numberLong: String(now) } },
      filename: 'logo.png',
      metadata: { contentType: 'image/png' },
    });
    expect(plan.steps[0]).toMatchObject({
      kind: 'app',
      action: 'gridfs.check-files',
      args: { files: [{ path: 'C:\\Users\\ada\\logo.png', size: 734_003 }] },
    });
    expect(plan.steps[3]).toMatchObject({
      kind: 'app',
      action: 'gridfs.write-chunks',
      args: {
        path: 'C:\\Users\\ada\\logo.png',
        size: 734_003,
        chunkSize: 261_120,
        where: 'Local › shop › fs',
        files: [{ name: 'logo.png', size: 734_003 }],
        index: 0,
        skipped: 0,
      },
    });
    expect([chunkCount(734_003), chunkLength(734_003, 2)]).toEqual([3, 211_763]);
    expect(plan.publishes).toBe(false);
  });

  it('uploads Makefile with metadata {}, and a file of 0 bytes with no chunk', () => {
    const files = [chosen('Makefile', 10, '65f1c0ffee0000000000b002'), chosen('empty', 0, '65f1c0ffee0000000000b003')];
    const plan = planOf(uploadWith({ files, existing: { names: [], empty: false } }));
    expect(plan.steps.map((step) => step.kind)).toEqual(['app', 'app', 'engine', 'engine']);
    const [makefile, empty] = sentRequests(plan).map((request) => request.arguments[0] as Record<string, Json>);
    expect(makefile?.['metadata']).toEqual({});
    expect(empty?.['length']).toEqual({ $numberLong: '0' });
  });

  it('asks nothing and confirms nothing when no name is in the bucket', () => {
    const plan = planOf(uploadWith({ files: [logo], existing: { names: [], empty: false } }));
    expect(plan.danger.kind).toBe('none');
  });

  it('titles the question with the first 3 names that exist and the number of the others', () => {
    const names = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'];
    const files = names.map((name, index) => chosen(name, 10, `65f1c0ffee0000000000b00${String(index)}`));
    const question = questionOf(uploadWith({ files, existing: { names, empty: false } }));
    expect(question.title).toBe('a.png, b.png, c.png and 2 more already in Local › shop › fs');
    expect(question.fields[0]).toMatchObject({ kind: 'pick-one', default: 'revision' });
  });

  it('adds a new revision beside the old file', () => {
    const plan = planOf(
      uploadWith({ files: [logo], existing: { names: ['logo.png'], empty: false }, 'existing-choice': 'revision' }),
    );
    expect(sentRequests(plan).map((request) => request.method)).toEqual(['insertOne']);
  });

  it('skips the names that exist, and says so', () => {
    const files = [
      logo,
      chosen('b.png', 3_670_016, '65f1c0ffee0000000000b004'),
      chosen('c.png', 1_000, '65f1c0ffee0000000000b005'),
    ];
    const plan = planOf(uploadWith({ files, existing: { names: ['c.png'], empty: false }, 'existing-choice': 'skip' }));
    expect(sentRequests(plan).map((request) => (request.arguments[0] as { filename: string }).filename)).toEqual([
      'logo.png',
      'b.png',
    ]);
    expect(plan.after[0]).toMatchObject({
      text: 'Uploaded 2 files (4.2 MB) to Local › shop › fs, skipped 1 that already existed.',
    });
  });

  it('with Replace, reads the old revisions, confirms, and deletes them after the new file in its group', () => {
    const answers = { files: [logo], existing: { names: ['logo.png'], empty: false }, 'existing-choice': 'replace' };
    expect(uploadWith(answers)).toMatchObject({
      kind: 'read',
      need: { key: 'replaced', read: 'gridfs.upload:replaced', args: { names: ['logo.png'] } },
    });
    const replaced = [
      { id: { $oid: '65f1c0ffee0000000000a2c1' }, filename: 'logo.png' },
      { id: { $oid: '65f1c0ffee0000000000a2c2' }, filename: 'logo.png' },
    ];
    const plan = planOf(uploadWith({ ...answers, replaced }));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: "Replace 1 file in Local › shop › fs?\nThe files with these names are deleted, with all their revisions, once the new ones are uploaded. This can't be undone.",
      button: 'Replace',
    });
    expect(
      plan.steps.map((step) =>
        step.kind === 'app' ? 'app' : (sentRequests({ ...plan, steps: [step] })[0]?.method ?? ''),
      ),
    ).toEqual(['app', 'app', 'insertOne', 'deleteOne', 'deleteMany', 'deleteOne', 'deleteMany']);
    expect(new Set(plan.steps.slice(1).map((step) => step.group)).size).toBe(1);
    expect(sentRequests(plan).filter((request) => request.method === 'deleteOne')).toMatchObject([
      { arguments: [{ _id: { $oid: '65f1c0ffee0000000000a2c1' } }] },
      { arguments: [{ _id: { $oid: '65f1c0ffee0000000000a2c2' } }] },
    ]);
  });

  it('has Open in the notification when started from the tree, and not from the page', () => {
    const answers = { files: [logo], existing: { names: [], empty: false } };
    const fromTree = planOf(uploadWith(answers)).after[0];
    expect(fromTree?.kind === 'notify' ? fromTree.actions : []).toEqual([
      expect.objectContaining({ label: 'Open', element: 'gridfs.show@notification', feature: 'gridfs.show' }),
    ]);
    const fromPage = planOf(uploadWith(answers, { from: 'page' })).after[0];
    expect(fromPage?.kind === 'notify' ? fromPage.actions : undefined).toBeUndefined();
  });

  it('says what was uploaded when cancelled, and the progress of a file', () => {
    const files = [
      { path: 'a', name: 'logo.png', size: 734_003, id: null },
      { path: 'b', name: 'b.png', size: 3_984_589, id: null },
      { path: 'c', name: 'c.png', size: 0, id: null },
    ];
    expect(upload.uploadedText(files.slice(0, 1), 'Local › shop › fs', { skipped: 0, cancelled: true })).toBe(
      'Uploaded 1 file (717 KB) to Local › shop › fs, cancelled.',
    );
    expect(upload.progressText(files, 0, 1_258_291)).toBe('logo.png (1 of 3) · 1.2 MB of 4.5 MB');
  });

  it('sends nothing when the file dialog is closed', () => {
    expect(planOf(uploadWith({ files: null })).steps).toEqual([]);
  });

  it('is refused on a read-only connection', () => {
    const outcome = upload.plan(contextOn('gridfs.upload', production), onFs({}, production));
    expect(refusalOf(outcome)).toEqual({
      code: 'gridfs.upload/read-only',
      message: "The connection Production is read-only: files can't be changed.",
    });
  });
});

describe('gridfs.create-bucket', () => {
  const onShop = { args: { connection: local.id, database: 'shop' } };

  it('asks the name of the bucket, starting with fs', () => {
    const question = questionOf(createBucket.plan(contextOn('gridfs.create-bucket'), onShop));
    expect(question.title).toBe('Upload files to GridFS in Local › shop');
    expect(question.fields[0]).toMatchObject({ key: 'bucket', default: 'fs' });
  });

  it('refuses my files, a$b and an empty name, and takes  photos  as photos', () => {
    for (const name of ['my files', 'a$b', '', 'a\u0000b']) {
      expect(refusalOf(createBucket.plan(contextOn('gridfs.create-bucket'), { ...onShop, bucket: name }))).toEqual({
        code: 'gridfs.create-bucket/bucket-name',
        message: 'Enter a name without spaces or $',
      });
    }
    const outcome = createBucket.plan(contextOn('gridfs.create-bucket'), { ...onShop, bucket: ' photos ' });
    expect(outcome).toMatchObject({
      kind: 'read',
      need: { key: 'files', args: { title: 'Upload files to Local › shop › photos' } },
    });
  });

  it('uploads to the bucket named, creating its collections with the first chunk', () => {
    const answers = { ...onShop, bucket: 'photos', files: [logo], existing: { names: [], empty: true } };
    const plan = planOf(createBucket.plan(contextOn('gridfs.create-bucket'), answers));
    expect(sentRequests(plan).map((request) => request.collection)).toEqual([
      'photos.files',
      'photos.chunks',
      'photos.files',
    ]);
    expect(plan.after).toContainEqual({ kind: 'refresh', connection: local.id });
  });

  it('creates nothing when the file dialog is closed', () => {
    const plan = planOf(
      createBucket.plan(contextOn('gridfs.create-bucket'), { ...onShop, bucket: 'photos', files: null }),
    );
    expect(plan.steps).toEqual([]);
  });

  it('is refused on a read-only connection', () => {
    const outcome = createBucket.plan(contextOn('gridfs.create-bucket', production), {
      args: { connection: production.id, database: 'shop' },
    });
    expect(refusalOf(outcome)).toEqual({
      code: 'gridfs.create-bucket/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});

describe('gridfs.drop-bucket', () => {
  it('reads the number of files, then asks to type fs before dropping both collections', () => {
    expect(dropBucket.plan(contextOn('gridfs.drop-bucket'), onFs())).toMatchObject({
      kind: 'read',
      need: { key: 'count', read: 'gridfs.drop-bucket:count' },
    });
    const plan = planOf(dropBucket.plan(contextOn('gridfs.drop-bucket'), { ...onFs(), count: 1234 }));
    expect(plan.danger).toEqual({
      kind: 'destructive',
      text: "Delete the GridFS bucket Local › shop › fs and its 1,234 files?\nDrops fs.files and fs.chunks. This can't be undone.",
      button: 'Delete',
      name: 'fs',
    });
    expect(stepTexts(plan)).toEqual(['db.getCollection("fs.files").drop()', 'db.getCollection("fs.chunks").drop()']);
    expect(plan.undo).toEqual({
      cannot: expect.stringMatching(/^It cannot be undone from the undo history/) as string,
    });
  });

  it('says its 1 file', () => {
    const plan = planOf(dropBucket.plan(contextOn('gridfs.drop-bucket'), { ...onFs(), count: 1 }));
    expect(plan.danger).toMatchObject({ text: expect.stringContaining('and its 1 file?') as string });
  });

  it('closes the tab of the bucket and leaves the bucket photos alone', () => {
    const tab = (id: string, bucket: string): Tab => ({
      id: tabId(id),
      shows: { kind: 'page', connection: local.id, page: 'gridfs', title: bucket, database: 'shop', of: [bucket] },
      lastActive: 0,
      loaded: true,
    });
    const base = stateWith([local]);
    const state: AppState = { ...base, tabs: { ...initialState.tabs, tabs: [tab('t1', 'fs'), tab('t2', 'photos')] } };
    const plan = planOf(dropBucket.plan(contextOn('gridfs.drop-bucket', local, state), { ...onFs(), count: 2 }));
    expect(plan.after.filter((after) => after.kind === 'start')).toEqual([
      { kind: 'start', feature: 'tab.close', target: { kind: 'app' }, args: { tab: 't1' } },
    ]);
    expect(sentRequests(plan).map((request) => request.collection)).toEqual(['fs.files', 'fs.chunks']);
  });

  it('reads the count with estimatedDocumentCount', () => {
    const [count] = mongoRequests(
      dropBucket.countRead.request(contextOn('gridfs.drop-bucket'), {
        connection: local.id,
        database: 'shop',
        bucket: 'fs',
      }),
    );
    expect(count).toMatchObject({ collection: 'fs.files', method: 'estimatedDocumentCount' });
    expect(dropBucket.countRead.parse([{ $numberInt: '1234' }], null)).toBe(1234);
  });

  it('is refused on a read-only connection', () => {
    const outcome = dropBucket.plan(contextOn('gridfs.drop-bucket', production), onFs({}, production));
    expect(refusalOf(outcome)).toEqual({
      code: 'gridfs.drop-bucket/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
