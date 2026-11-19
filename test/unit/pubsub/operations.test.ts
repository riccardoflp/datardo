import { describe, expect, it } from 'vitest';
import { commandArguments } from '../../../src/features/console/parse-line';
import { clearedPage, plan as clear } from '../../../src/features/pubsub/clear';
import { commandWord, copiedText, plan as copy } from '../../../src/features/pubsub/copy';
import { messagesAfter } from '../../../src/features/pubsub/keep';
import { pauseLabel, pausedPage, plan as pause, resumedPage } from '../../../src/features/pubsub/pause';
import { disconnectedPage, reconnectedPage } from '../../../src/features/pubsub/reconnect';
import { openedPage } from '../../../src/features/pubsub/types';
import type { PubSubPage, Subscription } from '../../../src/features/pubsub/types';
import type { Answers } from '../../../src/shared/feature';
import {
  arrived,
  bytes,
  cacheLocal,
  keptWith,
  now,
  offset,
  pageOf,
  planOf,
  pubsubContext,
  pubsubState,
} from './context';

const orders: Subscription = { kind: 'channel', name: bytes('orders'), answered: true, received: 0 };

function listening(overrides: Partial<PubSubPage> = {}): PubSubPage {
  return pageOf({ pageConnection: 'open', subscriptions: [orders], ...overrides });
}

function withArrived(page: PubSubPage, count: number, at = now): PubSubPage {
  const messages = Array.from({ length: count }, (_, index) => arrived('orders', `m${String(index)}`, at + index));
  return { ...page, kept: messagesAfter(page.kept, messages) };
}

describe('pubsub.pause', () => {
  it('holds three messages while paused: no row is added, and the button reads Resume (3)', () => {
    const paused = withArrived(pausedPage(listening()), 3);
    expect(paused.kept.listed).toEqual([]);
    expect(pauseLabel(paused)).toBe('Resume (3)');
    expect(pauseLabel(listening())).toBe('Pause');
  });

  it('adds the three rows on Resume, with the times they arrived, not the time of the resume', () => {
    const resumed = resumedPage(withArrived(pausedPage(listening()), 3, now - 60_000));
    expect(resumed.kept.listed.map((row) => (row.kind === 'message' ? row.receivedAt : 0))).toEqual([
      now - 60_000,
      now - 59_999,
      now - 59_998,
    ]);
  });

  it('sends no command to the server: one app step, pause the messages of the Pub/Sub page of Cache local', () => {
    const state = pubsubState([listening()]);
    expect(planOf(pause(pubsubContext('pubsub.pause', state), {})).steps).toEqual([
      {
        kind: 'app',
        text: 'pause the messages of the Pub/Sub page of Cache local',
        action: 'pubsub.pause',
        args: { connection: cacheLocal.id },
      },
    ]);
    expect(planOf(pause(pubsubContext('pubsub.pause', state), { args: 'resume' })).steps[0]?.text).toBe(
      'resume the messages of the Pub/Sub page of Cache local',
    );
  });

  it('is no longer paused once a page disconnected while paused is connected again, and the held messages are listed', () => {
    const held = withArrived(pausedPage(listening()), 2);
    const back = reconnectedPage(disconnectedPage(held, now + 10), now + 20);
    expect(back.kept.paused).toBe(false);
    expect(back.kept.listed.filter((row) => row.kind === 'message')).toHaveLength(2);
  });

  it('is not kept with the tab: a restored page listens', () => {
    expect(openedPage(cacheLocal.id, offset).kept.paused).toBe(false);
  });
});

describe('pubsub.clear', () => {
  it('leaves none of 1,204 listed and 42 held, and the button reads Resume with no number when paused', () => {
    const page = withArrived(pausedPage(withArrived(listening(), 1204)), 42);
    expect([page.kept.listed.length, page.kept.held.length]).toEqual([1204, 42]);
    const cleared = clearedPage({ ...page, selected: [3], inspected: 3 });
    expect([cleared.kept.listed.length, cleared.kept.held.length, cleared.selected.length]).toEqual([0, 0, 0]);
    expect(cleared.inspected).toBeUndefined();
    expect(pauseLabel(cleared)).toBe('Resume');
  });

  it('keeps the page subscribed: the next message published is listed, and the counts are back to 0', () => {
    const cleared = clearedPage(withArrived(listening({ subscriptions: [{ ...orders, received: 7 }] }), 7));
    expect(cleared.subscriptions).toEqual([orders]);
    expect(withArrived(cleared, 1).kept.listed).toHaveLength(1);
  });

  it('sends nothing to the server: one app step', () => {
    const steps = planOf(clear(pubsubContext('pubsub.clear', pubsubState([listening()])), {})).steps;
    expect(steps.map((step) => [step.kind, step.text])).toEqual([
      ['app', 'clear the messages of the Pub/Sub page of Cache local'],
    ]);
  });
});

describe('pubsub.copy', () => {
  const rows = keptWith([
    arrived('orders', '{"status":"paid"}', now),
    arrived('orders', 'hello world', now + 1),
    arrived('orders', Uint8Array.of(0x00, 0xff, 0x41), now + 2),
  ]).listed;

  it('copies exactly the 17 characters of {"status":"paid"} with Copy message', () => {
    expect(copiedText(rows.slice(0, 1), 'message', offset)).toBe('{"status":"paid"}');
  });

  it('copies PUBLISH orders "hello world" and PUBLISH orders "\\x00\\xffA", which the console reads back to the same bytes', () => {
    expect(copiedText(rows.slice(1, 2), 'command', offset)).toBe('PUBLISH orders "hello world"');
    expect(copiedText(rows.slice(2, 3), 'command', offset)).toBe('PUBLISH orders "\\x00\\xffA"');
    const read = commandArguments(copiedText(rows.slice(2, 3), 'command', offset));
    expect(read.kind === 'arguments' ? [...(read.arguments[2] ?? [])] : []).toEqual([0x00, 0xff, 0x41]);
    expect(commandWord(bytes('{"status":"paid"}'))).toBe('"{\\"status\\":\\"paid\\"}"');
  });

  it('copies three lines, the oldest first, for three rows selected', () => {
    expect(copiedText([...rows].reverse(), 'channel', offset)).toBe('orders\norders\norders');
    expect(copiedText(rows, 'message', offset).split('\n')).toEqual(['{"status":"paid"}', 'hello world', '00ff41']);
  });

  it('copies one object per message as JSON, as pubsub.export writes a line of JSON Lines', () => {
    expect(copiedText(rows.slice(0, 1), 'json', offset)).toBe(
      '{"time":"2025-11-17T17:20:00.000Z","channel":"orders","message":"{\\"status\\":\\"paid\\"}"}',
    );
  });

  it('sends nothing to the server: one app step that copies to the clipboard, then Copied 3 messages.', () => {
    const page = listening({ kept: { ...keptWith([]), listed: rows, next: 4 }, selected: [1, 2, 3] });
    const answers: Answers = { args: 'message' };
    const planned = planOf(copy(pubsubContext('pubsub.copy', pubsubState([page])), answers));
    expect(planned.steps.map((step) => [step.kind, step.text])).toEqual([['app', 'copy 3 messages to the clipboard']]);
    expect(planned.after).toEqual([{ kind: 'notify', level: 'success', text: 'Copied 3 messages.' }]);
  });
});
