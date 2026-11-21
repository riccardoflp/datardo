import { describe, expect, it } from 'vitest';
import * as deleteFile from '../../../src/features/gridfs/delete';
import * as download from '../../../src/features/gridfs/download';
import * as editMetadata from '../../../src/features/gridfs/edit-metadata';
import * as open from '../../../src/features/gridfs/open';
import * as rename from '../../../src/features/gridfs/rename';
import { stateWith } from '../connection/context';
import {
  contextOn,
  fs,
  gridFile,
  local,
  logoId,
  onFs,
  planOf,
  production,
  questionOf,
  refusalOf,
  sentRequests,
  stepTexts,
} from './context';

const logo = gridFile();

describe('gridfs.rename', () => {
  const started = onFs({ id: logoId });

  it('reads the file, then opens the field with its name, logo selected', () => {
    expect(rename.plan(contextOn('gridfs.rename'), started)).toMatchObject({
      kind: 'read',
      need: { key: 'file', read: 'gridfs.list:file', args: { bucket: 'fs', id: logoId } },
    });
    const question = questionOf(rename.plan(contextOn('gridfs.rename'), { ...started, file: logo }));
    expect(question.title).toBe('Rename logo.png');
    expect(question.fields[0]).toMatchObject({
      key: 'name',
      default: 'logo.png',
      selection: { start: 0, end: 4 },
    });
    expect(rename.selectedPart('logo.png')).toEqual({ start: 0, end: 4 });
  });

  it('sends the updateOne of the new name, by the _id with its type', () => {
    const plan = planOf(rename.plan(contextOn('gridfs.rename'), { ...started, file: logo, name: ' brand.png ' }));
    const [update] = sentRequests(plan);
    expect([update?.collection, update?.method]).toEqual(['fs.files', 'updateOne']);
    expect(update?.arguments).toEqual([{ _id: logoId }, { $set: { filename: 'brand.png' } }]);
    expect(plan.after[0]).toMatchObject({ text: 'Renamed logo.png to brand.png.' });
    expect(plan.publishes).toBe(false);
    expect(plan.undo).toHaveProperty('cannot');
  });

  it('refuses an empty name, and sends nothing and says nothing for the same name', () => {
    expect(refusalOf(rename.plan(contextOn('gridfs.rename'), { ...started, file: logo, name: '  ' })).code).toBe(
      'gridfs.rename/no-name',
    );
    const same = planOf(rename.plan(contextOn('gridfs.rename'), { ...started, file: logo, name: 'logo.png' }));
    expect(same.steps).toEqual([]);
    expect(same.after).toEqual([]);
  });

  it('refuses a file deleted meanwhile', () => {
    expect(refusalOf(rename.plan(contextOn('gridfs.rename'), { ...started, file: null }))).toEqual({
      code: 'gridfs.rename/gone',
      message: 'The file no longer exists.',
    });
  });

  it('is refused on a read-only connection', () => {
    const outcome = rename.plan(contextOn('gridfs.rename', production), onFs({ id: logoId }, production));
    expect(refusalOf(outcome)).toEqual({
      code: 'gridfs.rename/read-only',
      message: "The connection Production is read-only: files can't be changed.",
    });
  });
});

describe('gridfs.delete', () => {
  const started = onFs({ id: logoId });

  it('asks Delete logo.png (717 KB) from Local › shop › fs? and deletes its files document and its chunks', () => {
    const plan = planOf(deleteFile.plan(contextOn('gridfs.delete'), { ...started, file: logo }));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: "Delete logo.png (717 KB) from Local › shop › fs?\nIts chunks are deleted too. This can't be undone.",
      button: 'Delete',
    });
    expect(stepTexts(plan)).toEqual([
      'db.getCollection("fs.files").deleteOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") })',
      'db.getCollection("fs.chunks").deleteMany({ files_id: ObjectId("65f1c0ffee0000000000a2c1") })',
    ]);
    expect(plan.after[0]).toMatchObject({ text: 'Deleted logo.png.' });
    expect(plan.undo).toEqual({
      cannot: expect.stringMatching(/^It cannot be undone from the undo history/) as string,
    });
    expect(plan.publishes).toBe(false);
  });

  it('deletes only the revision started on, by its _id', () => {
    const other = gridFile({ _id: { $numberInt: '7' } });
    const plan = planOf(deleteFile.plan(contextOn('gridfs.delete'), { ...onFs({ id: other.id }), file: other }));
    expect(sentRequests(plan).map((request) => request.arguments[0])).toEqual([
      { _id: { $numberInt: '7' } },
      { files_id: { $numberInt: '7' } },
    ]);
  });

  it('is refused on a read-only connection, and for a file gone', () => {
    expect(
      refusalOf(deleteFile.plan(contextOn('gridfs.delete', production), onFs({ id: logoId }, production))).code,
    ).toBe('gridfs.delete/read-only');
    expect(refusalOf(deleteFile.plan(contextOn('gridfs.delete'), { ...started, file: null })).code).toBe(
      'gridfs.delete/gone',
    );
  });
});

describe('gridfs.download', () => {
  const started = onFs({ id: logoId });

  it('asks where to save it, proposing its name, then writes it there', () => {
    expect(download.plan(contextOn('gridfs.download'), { ...started, file: logo })).toEqual({
      kind: 'read',
      need: {
        key: 'path',
        read: 'gridfs.download:file',
        args: { mode: 'save', title: 'Download logo.png', name: 'logo.png' },
      },
    });
    const plan = planOf(
      download.plan(contextOn('gridfs.download'), { ...started, file: logo, path: 'C:\\Users\\ada\\logo.png' }),
    );
    expect(plan.steps).toEqual([
      {
        kind: 'file',
        action: 'write',
        path: 'C:\\Users\\ada\\logo.png',
        content: {
          writer: 'gridfs.download',
          args: {
            connection: local.id,
            database: 'shop',
            bucket: 'fs',
            id: logoId,
            title: 'Downloading logo.png',
            length: 734_003,
            cancelled: 'Download cancelled.',
          },
        },
        text: 'write C:\\Users\\ada\\logo.png',
      },
    ]);
    expect(plan.after[0]).toMatchObject({ text: 'Downloaded logo.png (717 KB) to C:\\Users\\ada\\logo.png.' });
  });

  it('proposes q1.pdf for reports/2026/q1.pdf, and download for reports/', () => {
    expect(download.proposedName('reports/2026/q1.pdf')).toBe('q1.pdf');
    expect(download.proposedName('reports\\q1.pdf')).toBe('q1.pdf');
    expect(download.proposedName('reports/')).toBe('download');
  });

  it('writes nothing when the save dialog is closed', () => {
    const plan = planOf(download.plan(contextOn('gridfs.download'), { ...started, file: logo, path: null }));
    expect(plan.steps).toEqual([]);
    expect(plan.after).toEqual([]);
  });

  it('works on a read-only connection, and refuses a file gone', () => {
    const readOnly = download.plan(contextOn('gridfs.download', production), {
      ...onFs({ id: logoId }, production),
      file: logo,
    });
    expect(readOnly.kind).toBe('read');
    expect(refusalOf(download.plan(contextOn('gridfs.download'), { ...started, file: null })).code).toBe(
      'gridfs.download/gone',
    );
  });
});

describe('gridfs.open', () => {
  const report = gridFile({ filename: 'report.pdf' });
  const temporary = 'C:\\Users\\ada\\AppData\\Local\\Temp';

  function openPlan(file = report, connection = local) {
    return planOf(
      open.plan(contextOn('gridfs.open', connection), {
        ...onFs({ id: file.id, filename: file.filename }, connection),
        file,
        folder: temporary,
      }),
    );
  }

  it('writes a copy named report.pdf under datardo-gridfs in the temporary folder and opens it', () => {
    const plan = openPlan();
    const [write, show] = plan.steps;
    expect(write).toMatchObject({ kind: 'file', action: 'write', content: { writer: 'gridfs.download' } });
    expect(write?.kind === 'file' ? write.path : '').toMatch(
      /^C:\\Users\\ada\\AppData\\Local\\Temp\\datardo-gridfs\\[\w-]{1,48}\\report\.pdf$/u,
    );
    expect(show).toMatchObject({
      kind: 'app',
      action: 'gridfs.open-copy',
      text: "open the copy with the system's application",
    });
  });

  it('writes the same file to the same path, and two files with one name to different folders', () => {
    const path = (plan: ReturnType<typeof openPlan>): string => {
      const [write] = plan.steps;
      return write?.kind === 'file' ? write.path : '';
    };
    expect(path(openPlan())).toBe(path(openPlan()));
    expect(path(openPlan(gridFile({ filename: 'report.pdf', _id: { $oid: '65f1c0ffee0000000000a2c2' } })))).not.toBe(
      path(openPlan()),
    );
    expect(open.copyFolder(fs, logoId)).toHaveLength(48);
  });

  it('copies reports/2026/q1.pdf as reports_2026_q1.pdf', () => {
    expect(open.copyName('reports/2026/q1.pdf')).toBe('reports_2026_q1.pdf');
    expect(open.copyName('..')).toBe('file');
    expect(open.copyName('')).toBe('file');
  });

  it.each(['setup.exe', 'run.bat', 'page.html', 'script.js', 'picture.svg', 'Makefile', 'photo.PDF.lnk'])(
    'refuses %s before anything is read',
    (filename) => {
      const outcome = open.plan(contextOn('gridfs.open'), onFs({ id: logoId, filename }));
      expect(refusalOf(outcome)).toEqual({
        code: 'gridfs.open/type',
        message: "Datardo doesn't open files of this type: download it instead.",
      });
    },
  );

  it('opens PHOTO.PNG, and works on a read-only connection', () => {
    expect(open.isOpened('PHOTO.PNG')).toBe(true);
    const state = stateWith([production]);
    expect(
      open.plan(contextOn('gridfs.open', production, state), onFs({ id: logoId, filename: 'PHOTO.PNG' }, production))
        .kind,
    ).toBe('read');
    expect(openPlan(report, production).steps).toHaveLength(2);
  });

  it('refuses a file gone, and a file renamed meanwhile to a type it does not open', () => {
    const started = onFs({ id: logoId, filename: 'report.pdf' });
    expect(refusalOf(open.plan(contextOn('gridfs.open'), { ...started, file: null })).code).toBe('gridfs.open/gone');
    const renamed = gridFile({ filename: 'report.html' });
    expect(refusalOf(open.plan(contextOn('gridfs.open'), { ...started, file: renamed })).code).toBe('gridfs.open/type');
  });
});

describe('gridfs.edit-metadata', () => {
  it('opens the document tab of its document in shop.fs.files, found by its _id with its type', () => {
    const plan = planOf(editMetadata.plan(contextOn('gridfs.edit-metadata'), onFs({ id: logoId })));
    expect(plan.steps[0]).toMatchObject({
      kind: 'app',
      action: 'tab.open',
      args: {
        shows: {
          kind: 'document',
          connection: local.id,
          database: 'shop',
          collection: 'fs.files',
          id: 'ObjectId("65f1c0ffee0000000000a2c1")',
          idJson: JSON.stringify(logoId),
        },
      },
    });
  });

  it('opens it on a read-only connection too', () => {
    const outcome = editMetadata.plan(contextOn('gridfs.edit-metadata', production), onFs({ id: logoId }, production));
    expect(planOf(outcome).steps).toHaveLength(1);
  });
});
