import { describe, expect, it } from 'vitest';
import { connectionId } from '../../../src/shared/ids';
import { view, warnEveryMs, withoutSecrets } from '../../../src/features/oplog/publish-error';
import { oplogText } from '../../../src/features/oplog/text';
import { initialOplogState, reduceOplog, type OplogState } from '../../../src/features/oplog/types';

const local = connectionId('c-local');
const other = connectionId('c-other');
const stopped = oplogText.noAnswer('cache', 6379);

function fail(oplog: OplogState, connection = local, now = 0, error = stopped): ReturnType<typeof view> {
  return view({ oplog, connection, name: connection === local ? 'Local' : 'Other', error, secrets: [], now });
}

describe('oplog.publish-error', () => {
  it('warns naming the connection and the error, and keeps it as the last error', () => {
    const shown = fail(initialOplogState, local, 1000);
    expect(shown.warning).toEqual({ level: 'warning', text: oplogText.warning('Local', stopped) });
    expect(shown.warning?.text).toContain('Local');
    expect(shown.warning?.text).toContain(stopped);
    const after = reduceOplog(initialOplogState, shown.event);
    expect(after.lastErrors[local]).toEqual({ time: 1000, message: stopped });
  });

  it('shows one warning for ten failures within 30 seconds, and again 30 seconds after the warning', () => {
    let oplog = initialOplogState;
    const warned: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const now = index * 2000;
      const shown = fail(oplog, local, now);
      if (shown.warning !== undefined) {
        warned.push(now);
      }
      oplog = reduceOplog(oplog, shown.event);
    }
    expect(warned).toEqual([0]);
    expect(fail(oplog, local, warnEveryMs).warning).toBeDefined();
  });

  it('warns for each of two connections failing at the same time', () => {
    const first = fail(initialOplogState, local, 5);
    const oplog = reduceOplog(initialOplogState, first.event);
    expect(first.warning).toBeDefined();
    expect(fail(oplog, other, 5).warning).toBeDefined();
  });

  it('never shows the linked connection string or its password', () => {
    const error = 'connect ECONNREFUSED redis://admin:s3cret@cache:6379 (s3cret)';
    const shown = view({
      oplog: initialOplogState,
      connection: local,
      name: 'Local',
      error,
      secrets: ['s3cret', 'redis://admin:s3cret@cache:6379'],
      now: 0,
    });
    expect(shown.warning?.text).not.toContain('s3cret');
    expect(shown.warning?.text).not.toContain('admin:');
    expect(withoutSecrets('redis://user:pw@host:1', [])).toBe('redis://host:1');
  });

  it('warns about a linked connection removed since', () => {
    expect(fail(initialOplogState, local, 0, oplogText.missingLink).warning?.text).toContain(
      'The linked connection is missing: choose it again in the connection.',
    );
  });

  it('forgets the errors of a connection once it is removed, so the next failure warns again', () => {
    const oplog = reduceOplog(initialOplogState, fail(initialOplogState).event);
    const forgotten = reduceOplog(oplog, { slice: 'oplog', type: 'forgotten', connection: local });
    expect(forgotten).toEqual(initialOplogState);
  });
});
