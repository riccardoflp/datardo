import { describe, expect, it } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Target } from '../../../src/shared/target';
import { undoNote } from '../../../src/features/undo/note';
import { connectionTooltip, isVariantOffered, plan } from '../../../src/features/undo/per-connection';
import { appStateWith, cacheConnection, contextOf, defaultUndo, localConnection, stepsOf, withArgs } from './harness';

function on(connection: ConnectionView): Target {
  return { kind: 'connection', connection: connection.id };
}

function perConnection(connection: ConnectionView, variant: 'stop' | 'keep'): ReturnType<typeof plan> {
  const context = contextOf('undo.per-connection', appStateWith(undefined, [connection]), undefined, on(connection));
  return plan(context, withArgs(variant));
}

describe('undo.per-connection', () => {
  it('saves the connection with its undo history off, and its writes are then not recorded', () => {
    expect(stepsOf(perConnection(localConnection, 'stop'))).toEqual([
      {
        kind: 'app',
        action: 'connection.set-keeps-undo',
        args: { connection: localConnection.id, keepsUndo: false },
        text: 'save the connection Local',
      },
    ]);
    const stopped = { ...localConnection, keepsUndo: false };
    expect(undoNote(stopped, { keeps: null }, 1, defaultUndo)).toMatchObject({
      recorded: false,
      line: "The undo history is off for this connection: this can't be undone.",
    });
    expect(connectionTooltip(stopped)).toBe("Changes aren't kept in the undo history");
  });

  it('records the next writes again after Keep undo history', () => {
    const stopped = { ...localConnection, keepsUndo: false };
    expect(isVariantOffered(stopped, 'keep')).toBe(true);
    expect(isVariantOffered(stopped, 'stop')).toBe(false);
    expect(stepsOf(perConnection(stopped, 'keep'))[0]).toMatchObject({ args: { keepsUndo: true } });
  });

  it('is refused on a read-only connection, which records nothing whatever this choice', () => {
    const readOnly = { ...localConnection, readOnly: true };
    expect(perConnection(readOnly, 'stop')).toMatchObject({ kind: 'refuse', code: 'undo.per-connection/read-only' });
    expect(isVariantOffered(readOnly, 'stop')).toBe(false);
    expect(undoNote(readOnly, { keeps: null }, 1, defaultUndo).recorded).toBe(false);
  });

  it('works the same on a MongoDB and on a Redis connection', () => {
    expect(stepsOf(perConnection(cacheConnection, 'stop'))[0]).toMatchObject({
      action: 'connection.set-keeps-undo',
      args: { connection: cacheConnection.id, keepsUndo: false },
    });
  });
});
