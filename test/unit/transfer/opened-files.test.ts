/**
 * What the main process opens when the window asks (R14.10, T24): only a file a step of this session wrote, opened by
 * its program only when its type is one programs open as data, otherwise shown in its folder; any other path refused.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({
  openPath: vi.fn(() => Promise.resolve('')),
  showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({ shell, app: { getPath: () => tmpdir() }, dialog: {} }));

const { openPath } = await import('../../../src/main/actions/transfer');
const { revealFile } = await import('../../../src/main/actions/relation');
const { openCopy } = await import('../../../src/main/actions/gridfs');
const { copiesFolder, removeCopies } = await import('../../../src/main/gridfs');
const { forgetWritten, openedAs, recordWritten } = await import('../../../src/main/opened-files');

const signal = new AbortController().signal;
const folder = join(tmpdir(), 'datardo-opened');

beforeEach(() => {
  forgetWritten();
  shell.openPath.mockClear();
  shell.showItemInFolder.mockClear();
});

afterEach(async () => {
  await removeCopies();
});

describe('transfer.export', () => {
  it('opens a JSON export of this session with the system’s application', async () => {
    const path = join(folder, 'orders.json');
    recordWritten(path, 'transfer.export');
    await openPath({ path }, signal);
    expect(shell.openPath).toHaveBeenCalledWith(path);
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('shows an export saved as orders.html in its folder, and opens it in no program', async () => {
    const path = join(folder, 'orders.html');
    recordWritten(path, 'transfer.export');
    await openPath({ path }, signal);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(path);
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it('opens nothing for a path no export of this session wrote', async () => {
    const path = join(folder, 'evil.json');
    await expect(openPath({ path }, signal)).rejects.toThrow(`Datardo opens only a file it has just written: ${path}`);
    recordWritten(path, 'relation.svg');
    await expect(openPath({ path }, signal)).rejects.toThrow('Datardo opens only a file it has just written');
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('decides by the extension in any case, and refuses an empty path', () => {
    recordWritten(join(folder, 'a.CSV'), 'transfer.export');
    recordWritten(join(folder, 'a.hta'), 'transfer.export');
    const rules = { writers: ['transfer.export'], opens: new Set(['json', 'jsonl', 'csv']) };
    expect(openedAs(join(folder, 'a.CSV'), rules)).toBe('open');
    expect(openedAs(join(folder, 'a.hta'), rules)).toBe('show');
    expect(openedAs('', rules)).toBe('refuse');
  });
});

describe('relation.export-svg', () => {
  it('shows the diagram saved in this session in its folder, and opens it in no program', async () => {
    const path = join(folder, 'shop-diagram.svg');
    recordWritten(path, 'relation.svg');
    await revealFile({ path }, signal);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(path);
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it('shows nothing and opens nothing for a path no Save SVG… of this session wrote', async () => {
    const path = join(folder, 'other.svg');
    await expect(revealFile({ path }, signal)).rejects.toThrow(
      `Datardo shows only a file it has just written: ${path}`,
    );
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
    expect(shell.openPath).not.toHaveBeenCalled();
  });
});

describe('gridfs.open', () => {
  it('hands to the system only a copy of this run’s folder, written in this session, of a type of the list', async () => {
    const copies = await copiesFolder(tmpdir());
    const copy = join(copies, 'f', 'report.pdf');
    recordWritten(copy, 'gridfs.download');
    await openCopy({ path: copy }, signal);
    expect(shell.openPath).toHaveBeenCalledWith(copy);
  });

  it('refuses a copy of a type not in the list, a path outside the folder, and a path not written', async () => {
    const copies = await copiesFolder(tmpdir());
    const script = join(copies, 'f', 'page.html');
    recordWritten(script, 'gridfs.download');
    const outside = join(folder, 'report.pdf');
    recordWritten(outside, 'gridfs.download');
    for (const path of [script, outside, join(copies, 'f', 'never.pdf')]) {
      await expect(openCopy({ path }, signal)).rejects.toThrow("Datardo doesn't open files of this type");
    }
    expect(shell.openPath).not.toHaveBeenCalled();
  });
});
