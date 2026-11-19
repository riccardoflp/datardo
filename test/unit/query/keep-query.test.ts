/**
 * What the main process keeps of a collection tab's query after `query.run` read it (`query.restore`): the text
 * `keptText` writes, in `TabMemory.query`, which the session saves.
 */
import { describe, expect, it } from 'vitest';
import { AppStateHolder } from '../../../src/main/app-state';
import { keepTabQuery } from '../../../src/main/query';
import { keptText, restoredQuery } from '../../../src/features/query/restore';
import { emptyTexts } from '../../../src/features/query/types';
import type { Intent } from '../../../src/shared/bridge';
import { connectionId, featureId, tabId, type RefusalCode } from '../../../src/shared/ids';

const shows = {
  kind: 'collection',
  connection: connectionId('c-local'),
  database: 'shop',
  collection: 'orders',
} as const;
const kept = keptText({
  mode: 'find',
  texts: { ...emptyTexts, filter: '{ status: "paid" }' },
  page: 3,
  pageSize: 100,
  builderOpen: false,
});

function holderWithTab(): AppStateHolder {
  const holder = new AppStateHolder();
  holder.dispatch({ slice: 'tabs', type: 'opened', seed: { shows }, key: 'orders', background: false, at: 1 });
  return holder;
}

function intent(feature: string, keep: string = kept): Intent {
  return {
    feature: featureId(feature),
    target: { kind: 'collection', connection: shows.connection, database: 'shop', collection: 'orders' },
    args: { tab: 'tab-1', keep },
  };
}

describe('query.restore keeps the query a tab last ran', () => {
  it('keeps the query of the tab once query.run read its documents', () => {
    const holder = holderWithTab();
    keepTabQuery(holder, intent('query.run'), { kind: 'read', result: { documents: [] } });
    const tab = holder.get().tabs.tabs.find((each) => each.id === tabId('tab-1'));
    expect(tab?.memory?.query).toBe(kept);
    expect(restoredQuery(tab?.memory?.query)).toMatchObject({ page: 3, pageSize: 100 });
  });

  it('keeps nothing for a query refused, cancelled or failed, or for another feature', () => {
    const holder = holderWithTab();
    keepTabQuery(holder, intent('query.run'), { kind: 'refused', code: 'x' as RefusalCode, message: 'No.' });
    keepTabQuery(holder, intent('query.run'), { kind: 'cancelled' });
    keepTabQuery(holder, intent('query.run'), { kind: 'failed', message: 'Down.' });
    keepTabQuery(holder, intent('query.count'), { kind: 'read', result: { count: 1, estimated: false } });
    expect(holder.get().tabs.tabs[0]?.memory).toBeUndefined();
  });

  it('writes the kept text again as restore reads it, whatever the window sent', () => {
    const holder = holderWithTab();
    keepTabQuery(holder, intent('query.run', '{"pageSize":37}'), { kind: 'read', result: { documents: [] } });
    expect(restoredQuery(holder.get().tabs.tabs[0]?.memory?.query).pageSize).toBe(50);
  });
});
