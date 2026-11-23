import { describe, expect, it } from 'vitest';
import { builtinCommands } from '../../../src/features/console/command-docs';
import { copiedText } from '../../../src/features/console/copy-reply';
import { lineTokens, linesToRun, view as inputView } from '../../../src/features/console/input';
import {
  clockText,
  durationText,
  entriesAfter,
  sizeText,
  view as outputView,
  type OutputInput,
} from '../../../src/features/console/output';
import { isOffered, plan as show, view as showView } from '../../../src/features/console/show';
import type { ConsoleState, OutputEntry } from '../../../src/features/console/types';
import type { Outcome, Plan } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { mongoConnection } from '../connection/context';
import { bulk, cacheLocal, cacheProduction, consoleContext, consoleOn, consoleState, session } from './context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

function entry(id: number, line: string, overrides: Partial<OutputEntry> = {}): OutputEntry {
  return { id, prompt: 'db0>', line, sentAt: 0, tookMs: 0.4, protocol: 3, notes: [], ...overrides };
}

function outputOf(console: ConsoleState, overrides: Partial<OutputInput> = {}): ReturnType<typeof outputView> {
  return outputView({ console, offsetMinutes: 0, shown: {}, whole: [], scrolledUp: false, ...overrides });
}

const twoPm = Date.UTC(2026, 10, 19, 14, 5, 9);

describe('console.show', () => {
  it('opens the tab Console of Cache local, connecting it first when it is not', () => {
    const opened = planOf(show(consoleContext('console.show', consoleState()), {}));
    expect(opened.steps).toEqual([]);
    expect(opened.after).toEqual([
      {
        kind: 'start',
        feature: 'tab.open',
        target: { kind: 'connection', connection: 'c-cache' },
        args: { shows: { kind: 'console', connection: 'c-cache' } },
      },
    ]);
    const state = consoleState();
    const disconnected = { ...state, connections: { ...state.connections, live: {} } } as AppState;
    expect(planOf(show(consoleContext('console.show', disconnected), {})).after.map((after) => after.kind)).toEqual([
      'start',
      'start',
    ]);
  });

  it('is not offered with a MongoDB connection current', () => {
    const orders = mongoConnection({ id: connectionId('c-orders') });
    const state = consoleState();
    const withMongo = { ...state, connections: { ...state.connections, saved: [cacheLocal, orders] } } as AppState;
    expect(isOffered(withMongo, 'c-orders')).toBe(false);
    expect(isOffered(withMongo, 'c-cache')).toBe(true);
  });

  it('reads the notice, and on Cache production the notice that it is read-only', () => {
    const local = showView({ console: consoleOn(cacheLocal), readOnly: false, databases: [0] });
    expect(local.toolbar.notice).toBe('Commands run here are not recorded in the undo history.');
    const production = showView({ console: consoleOn(cacheProduction), readOnly: true, databases: [0] });
    expect(production.toolbar.notice).toBe(
      'Commands run here are not recorded in the undo history. This connection is read-only: commands that write are refused.',
    );
    expect(production.readOnly).toBe('Read-only');
  });

  it('shows the prompt db0> on the database 0 and db2> on the database 2', () => {
    expect(showView({ console: consoleOn(cacheLocal), readOnly: false, databases: [0] }).prompt).toBe('db0>');
    const onTwo = consoleOn(cacheLocal, { session: session({ database: 2 }) });
    expect(showView({ console: onTwo, readOnly: false, databases: [0] }).prompt).toBe('db2>');
  });

  it('offers db3 in the database menu, which runs SELECT 3, and says db0 · RESP3 · 12 ms', () => {
    const console = consoleOn(cacheLocal, { lastReplyMs: 12, entries: [entry(1, 'PING')] });
    const shown = showView({ console, readOnly: false, databases: [3, 0] });
    expect(shown.toolbar.database).toMatchObject({ value: 'db0', element: 'console.run@toolbar' });
    expect(shown.toolbar.database.choices).toEqual([
      { label: 'db0', line: 'SELECT 0', chosen: true },
      { label: 'db3', line: 'SELECT 3', chosen: false },
    ]);
    expect(shown.status).toBe('db0 · RESP3 · 12 ms');
    expect(shown.state).toBe('ready');
    expect(shown.title).toBe('Console');
  });
});

describe('console.output', () => {
  it('ends with the line db0> GET greeting, its time and "hello world" after GET greeting', () => {
    const console = consoleOn(cacheLocal, {
      entries: [entry(1, 'GET greeting', { sentAt: twoPm, reply: bulk('hello world') })],
    });
    const item = outputOf(console).items.at(-1);
    expect(item).toMatchObject({ prompt: 'db0>', line: 'GET greeting', sentAt: '14:05:09', took: '0.4 ms' });
    expect(item?.lines.map((line) => line.text)).toEqual(['"hello world"']);
    expect(clockText(twoPm, 60)).toBe('15:05:09');
    expect(durationText(1240)).toBe('1.24 s');
  });

  it('drops the first command at the 501st', () => {
    let entries: readonly OutputEntry[] = [];
    for (let id = 1; id <= 501; id += 1) {
      entries = entriesAfter(entries, entry(id, 'PING'));
    }
    expect(entries.length).toBe(500);
    expect(entries[0]?.id).toBe(2);
  });

  it('shows 1,000 elements of 12,500 and Show 1,000 more, then 2,000', () => {
    const items = Array.from({ length: 12_500 }, (_, index) => bulk(String(index)));
    const console = consoleOn(cacheLocal, {
      entries: [entry(7, 'LRANGE queue 0 -1', { reply: { kind: 'array', items } })],
    });
    const first = outputOf(console).items[0];
    expect(first?.lines.length).toBe(1000);
    expect(first?.more).toEqual({ label: 'Show 1,000 more', shownOf: '1,000 of 12,500' });
    const second = outputOf(console, { shown: { 7: 2000 } }).items[0];
    expect(second?.lines.length).toBe(2000);
  });

  it('shows 10,000 characters of a string of 1,048,576 and Show all, and Copy reply copies all of it', () => {
    const blob = entry(3, 'GET blob', { reply: bulk('a'.repeat(1_048_576)) });
    const shown = outputOf(consoleOn(cacheLocal, { entries: [blob] })).items[0];
    expect(shown?.lines[0]?.text.length).toBe(10_001);
    expect(shown?.lines[0]?.text.endsWith('…')).toBe(true);
    expect(shown?.showAll).toEqual({ label: 'Show all', size: '1.0 MB' });
    const whole = outputOf(consoleOn(cacheLocal, { entries: [blob] }), { whole: [3] }).items[0];
    expect(whole?.showAll).toBeUndefined();
    expect(copiedText(blob, 'reply')?.length).toBe(1_048_576 + 2);
    expect(sizeText(9)).toBe('9 bytes');
  });

  it('shows Newest while the output is scrolled up', () => {
    expect(outputOf(consoleOn(cacheLocal), { scrolledUp: true }).newest).toBe('Newest');
    expect(outputOf(consoleOn(cacheLocal)).newest).toBeUndefined();
  });

  it('shows a refused command as its line and the message, nothing else', () => {
    const refused: OutputEntry = {
      id: 4,
      prompt: 'db0>',
      line: 'SUBSCRIBE orders',
      sentAt: 0,
      protocol: 3,
      notes: [],
      refusal: { code: 'console.run/subscribe', message: 'SUBSCRIBE…', offersPubSub: true },
    };
    const item = outputOf(consoleOn(cacheLocal, { entries: [refused] })).items[0];
    expect(item?.lines).toEqual([]);
    expect(item?.took).toBeUndefined();
    expect(item?.refusal).toEqual({
      message: 'SUBSCRIBE…',
      openPubSub: { label: 'Open Pub/Sub', feature: 'pubsub.show' },
    });
  });

  it('offers Copy reply, Copy command and Run again in the menu of an item, never Run again with a secret', () => {
    const get = outputOf(consoleOn(cacheLocal, { entries: [entry(1, 'GET a', { reply: bulk('x') })] })).items[0];
    expect(get?.menu.map((each) => each.element)).toEqual([
      'console.copy-reply@item-menu',
      'console.copy-reply@item-menu',
      'console.run@item-menu',
    ]);
    const auth = outputOf(consoleOn(cacheLocal, { entries: [entry(2, 'AUTH app ***')] })).items[0];
    expect(auth?.menu.map((each) => each.label)).toEqual(['Copy reply', 'Copy command']);
  });

  it('says what to type with nothing run', () => {
    expect(outputOf(consoleOn(cacheLocal)).empty).toBe(
      'Type a Redis command and press Enter. Up and Down go through the commands you ran before.',
    );
  });
});

describe('console.input', () => {
  it('runs the three pasted lines SET a 1, SET b 2 and GET a in that order, and nothing of empty lines', () => {
    expect(linesToRun('SET a 1\nSET b 2\r\nGET a')).toEqual(['SET a 1', 'SET b 2', 'GET a']);
    expect(linesToRun('')).toEqual([]);
    expect(linesToRun('   \n  ')).toEqual([]);
  });

  it('names its controls Command, Run and Stop', () => {
    const ready = inputView({ console: consoleOn(cacheLocal), typed: '', caret: 0, docs: builtinCommands });
    expect(ready).toMatchObject({
      label: 'Command',
      prompt: 'db0>',
      placeholder: 'Type a command, for example GET orders:42',
      button: { label: 'Run', element: 'console.run@editor' },
    });
    const running = inputView({
      console: consoleOn(cacheLocal, { status: 'running', running: 'BLPOP' }),
      typed: '',
      caret: 0,
      docs: builtinCommands,
    });
    expect(running.button).toEqual({ label: 'Stop', feature: 'console.stop', element: 'console.stop@editor' });
    expect(running.running).toBe(true);
    expect(ready.running).toBe(false);
  });

  it('keeps the prompt in its place while a command runs, and gives Run and Stop one width', () => {
    const running = inputView({
      console: consoleOn(cacheLocal, { status: 'running', running: 'BLPOP' }),
      typed: '',
      caret: 0,
      docs: builtinCommands,
    });
    expect(running.prompt).toBe('db0>');
    expect(running.buttonLabels).toEqual(['Run', 'Stop']);
  });

  it('colors the command, quoted text, numbers, escapes and a quote never closed', () => {
    expect(lineTokens('SET k "a\\nb" 12').map((token) => token.kind)).toEqual([
      'command',
      'string',
      'escape',
      'number',
    ]);
    expect(lineTokens('SET b "2').map((token) => token.kind)).toEqual(['command', 'unclosed']);
  });

  it('shows the hint of the line the caret is on, and its suggestions when the list is open', () => {
    const typed = 'SET a 1\ngetr';
    const shown = inputView({
      console: consoleOn(cacheLocal),
      typed,
      caret: typed.length,
      docs: builtinCommands,
      list: { opening: 'typing', selected: 0 },
    });
    expect(shown.suggestions?.items.map((item) => item.name)).toEqual(['GETRANGE']);
    expect(shown.suggestions).toMatchObject({ shown: 10, selected: 0 });
  });
});
