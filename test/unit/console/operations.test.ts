import { describe, expect, it } from 'vitest';
import { clearedEntries, plan as clear } from '../../../src/features/console/clear';
import { plan as clearHistory } from '../../../src/features/console/clear-history';
import { copiedText, plan as copyReply } from '../../../src/features/console/copy-reply';
import { promptOf } from '../../../src/features/console/session';
import { plan as stop, stoppedNote } from '../../../src/features/console/stop';
import type { OutputEntry } from '../../../src/features/console/types';
import type { Outcome, Plan } from '../../../src/shared/feature';
import {
  bulk,
  bytes,
  cacheLocal,
  cacheProduction,
  consoleContext,
  consoleOn,
  consoleState,
  session,
  words,
} from './context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

function entry(id: number, line: string, overrides: Partial<OutputEntry> = {}): OutputEntry {
  return { id, prompt: 'db0>', line, sentAt: 0, tookMs: 1, protocol: 3, notes: [], ...overrides };
}

describe('console.clear', () => {
  it('empties the output with one app step and sends nothing to the server', () => {
    const cleared = planOf(clear(consoleContext('console.clear', consoleState([consoleOn(cacheLocal)])), {}));
    expect(cleared.steps).toEqual([
      {
        kind: 'app',
        text: 'clear the output of the console of Cache local',
        action: 'console.clear',
        args: { connection: 'c-cache' },
      },
    ]);
    expect(cleared.danger).toEqual({ kind: 'none' });
  });

  it('keeps the history, the transaction and the command still running', () => {
    const queued = session({ transaction: { queued: [words('SET', 'a', '1'), words('INCR', 'a')], rejected: false } });
    expect(promptOf(queued)).toBe('db0 (MULTI, 2 queued)>');
    const running: OutputEntry = { id: 3, prompt: 'db0>', line: 'BLPOP queue 30', sentAt: 0, protocol: 3, notes: [] };
    expect(clearedEntries([entry(1, 'GET a', { reply: bulk('x') }), running])).toEqual([running]);
  });
});

describe('console.clear-history', () => {
  it('confirms how many commands are forgotten and that it cannot be undone', () => {
    const history = Array.from({ length: 212 }, (_, index) => `GET k${String(index)}`);
    const state = consoleState([
      consoleOn(cacheLocal, { history }),
      consoleOn(cacheProduction, { history: ['GET a'] }),
    ]);
    const cleared = planOf(clearHistory(consoleContext('console.clear-history', state), {}));
    expect(cleared).toMatchObject({
      title: 'Clear the console history of Cache local?',
      danger: {
        kind: 'confirm',
        text: 'The 212 commands kept for this connection are forgotten.',
        button: 'Clear history',
      },
      undo: { cannot: 'The commands are kept nowhere else.' },
      steps: [{ text: 'clear the console history of Cache local', args: { connection: 'c-cache' } }],
      after: [{ kind: 'notify', text: 'Cleared the console history of Cache local.' }],
    });
  });

  it('refuses an empty history, with no confirmation', () => {
    const state = consoleState([consoleOn(cacheLocal)]);
    expect(clearHistory(consoleContext('console.clear-history', state), {})).toEqual({
      kind: 'refuse',
      code: 'console.clear-history/empty',
      message: 'The console history of Cache local is already empty.',
    });
  });
});

describe('console.copy-reply', () => {
  const lrange = entry(1, 'LRANGE queue 0 -1', {
    reply: { kind: 'array', items: Array.from({ length: 1500 }, (_, index) => bulk(String(index))) },
  });

  it('copies every line of the whole reply, also the parts the output has not drawn', () => {
    const copied = copiedText(lrange, 'reply')?.split('\n') ?? [];
    expect(copied.length).toBe(1500);
    expect(copied[1499]).toBe('1500) "1499"');
  });

  it('copies a value without its quotes and with its escapes undone, or in hexadecimal', () => {
    const greeting = entry(2, 'GET greeting', { reply: bulk('hello world') });
    expect(copiedText(greeting, 'value', { line: 0, string: 0 })).toBe('hello world');
    const json = entry(3, 'GET json', { reply: bulk('{"a":"b"}\n') });
    expect(copiedText(json, 'value', { line: 0, string: 0 })).toBe('{"a":"b"}\n');
    const binary = entry(4, 'GET bin', { reply: { kind: 'bulk', bytes: bytes(0x00, 0xff, 0x41) } });
    expect(copiedText(binary, 'value', { line: 0, string: 0 })).toBe('00ff41');
  });

  it('copies the command AUTH app *** as the output shows it: the password was never kept', () => {
    const auth = entry(5, 'AUTH app ***', { reply: { kind: 'simple', text: 'OK' } });
    expect(copiedText(auth, 'command')).toBe('AUTH app ***');
  });

  it('writes nothing but the app step, sends nothing to the server, and says Copied.', () => {
    const state = consoleState([consoleOn(cacheLocal, { entries: [entry(2, 'GET greeting', { reply: bulk('hi') })] })]);
    const copied = planOf(
      copyReply(consoleContext('console.copy-reply', state), { args: { variant: 'reply', entry: 2 } }),
    );
    expect(copied.steps).toEqual([
      {
        kind: 'app',
        text: 'copy the reply of GET greeting to the clipboard',
        action: 'nav.copy',
        args: { text: '"hi"' },
      },
    ]);
    expect(copied.after).toEqual([{ kind: 'notify', level: 'success', text: 'Copied.' }]);
    const fromGoTo = planOf(copyReply(consoleContext('console.copy-reply', state), { args: 'command' }));
    expect(fromGoTo.steps[0]).toMatchObject({ args: { text: 'GET greeting' } });
  });
});

describe('console.stop', () => {
  it("closes the console's connection and opens it again on the same database", () => {
    const running = consoleOn(cacheLocal, { status: 'running', running: 'BLPOP', session: session({ database: 2 }) });
    const stopped = planOf(stop(consoleContext('console.stop', consoleState([running])), {}));
    expect(stopped.steps.map((step) => step.text)).toEqual([
      "close the console's connection to Cache local",
      'open a connection to cache:6379 for the console',
      'HELLO 3 SETNAME datardo-console',
      'SELECT 2',
    ]);
    expect(stoppedNote(12_400)).toBe(
      "Stopped after 12.4 s. The console's connection was closed and opened again; the server may still finish the command.",
    );
  });

  it('does nothing with no command running', () => {
    const idle = planOf(stop(consoleContext('console.stop', consoleState([consoleOn(cacheLocal)])), {}));
    expect(idle.steps).toEqual([]);
  });
});
