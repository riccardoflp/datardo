/**
 * The drafts of document tabs: the tab of a new document opened with the text of the insert dialog, the draft kept
 * while the text differs from the document as loaded (`tab.restore` with `{ tab, draft }`), and **Save** of the
 * question of `tab.close`, which saves the document through its own feature.
 */
import { describe, expect, it } from 'vitest';
import { feature as close } from '../../../src/features/tab/close';
import { feature as open } from '../../../src/features/tab/open';
import { feature as restore } from '../../../src/features/tab/restore';
import { readTabShows } from '../../../src/features/tab/types';
import { targetKey } from '../../../src/features/tab/same-target';
import { tabTitle } from '../../../src/features/tab/title';
import type { Intent } from '../../../src/shared/bridge';
import type { Json } from '../../../src/shared/engine-request';
import type { TabShows } from '../../../src/shared/state/tabs';
import { document, harness, local } from './harness';

const newDocument: TabShows = {
  kind: 'document',
  connection: local.id,
  database: 'shop',
  collection: 'orders',
  id: 'New document 1',
  newDocument: 1,
};

describe('tab.open', () => {
  it('opens New document 1 with the text of the insert dialog as its draft, unsaved', async () => {
    const h = harness();
    await h.start(open, JSON.parse(JSON.stringify({ shows: newDocument, draft: { text: '{ name: "Ada" }' } })) as Json);
    const [tab] = h.state().tabs.tabs;
    expect(tab).toMatchObject({ unsaved: true, draft: { text: '{ name: "Ada" }' }, shows: { newDocument: 1 } });
  });

  it('tells two new documents apart, and keeps the view of a document of a view', () => {
    expect(targetKey(newDocument)).not.toBe(targetKey({ ...newDocument, newDocument: 2 }));
    const read = readTabShows({ ...document('7', '{"$numberInt":"7"}'), view: true });
    expect(read).toMatchObject({ kind: 'document', id: '7', view: true });
    expect(readTabShows({ ...newDocument })).toMatchObject({ newDocument: 1 });
  });

  it('titles the tab of a new document orders · New document 1, never cut', () => {
    expect(tabTitle(newDocument, [newDocument]).text).toBe('orders · New document 1');
  });
});

describe('tab.restore', () => {
  it('keeps the draft of a document tab while it differs from the document as loaded, and drops it after', async () => {
    const h = harness();
    await h.open(document('7', '{"$numberInt":"7"}'));
    const id = h.tab('orders · 7').id;
    await h.start(restore, { tab: id, draft: { text: '{ _id: 7, a: 2 }', original: '{"_id":7}' } });
    expect(h.tab('orders · 7')).toMatchObject({
      unsaved: true,
      draft: { text: '{ _id: 7, a: 2 }', original: '{"_id":7}' },
    });
    await h.start(restore, { tab: id, draft: null });
    expect(h.tab('orders · 7')).not.toHaveProperty('draft');
    expect(h.tab('orders · 7').unsaved).toBe(false);
  });
});

describe('tab.close', () => {
  it('Save saves the document through document.save, then closes the tab', async () => {
    const h = harness();
    const started: Intent[] = [];
    Object.assign(h.services, {
      start: (intent: Intent) => {
        started.push(intent);
        return Promise.resolve({ kind: 'done' });
      },
    });
    await h.open(document('7', '{"$numberInt":"7"}'));
    const id = h.tab('orders · 7').id;
    await h.start(restore, { tab: id, draft: { text: '{ _id: 7, a: 2 }' } });
    await h.start(close, { tab: id }, { changes: 'save' });
    expect(started).toMatchObject([{ feature: 'document.save', args: { tab: id } }]);
    expect(h.titles()).not.toContain('orders · 7');
  });
});
