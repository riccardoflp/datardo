import { describe, expect, it } from 'vitest';
import { killNotification, plan } from '../../../src/features/server/kill-client';
import type { Outcome } from '../../../src/shared/feature';
import { cacheLocal, cacheProduction, commandText, contextOn, planOf } from './context';

const client42 = {
  id: '42',
  address: '10.0.0.7:52144',
  name: 'orders-api',
  user: 'app',
  idleSeconds: 3,
  command: 'blpop',
  flags: 'b',
};

function killing(client: object, connection = cacheLocal, own = '149'): Outcome {
  return plan(contextOn('server.kill-client', connection), { args: { client, own } });
}

describe('server.kill-client', () => {
  it('Disconnect… on the client 42 shows its title, its line, the step CLIENT KILL ID 42 and the button Disconnect', () => {
    const shown = planOf(killing(client42));
    expect(shown.title).toBe('Disconnect client 42?');
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        '10.0.0.7:52144 · orders-api · user app · idle 3 s · last command blpop\n' +
        'Its connection is closed at once, and a transaction it had open is discarded. Most clients connect again by themselves.',
      button: 'Disconnect',
    });
    expect(shown.steps).toHaveLength(1);
    const [step] = shown.steps;
    expect(step?.kind === 'engine' && step.request.engine === 'redis' ? commandText(step.request) : '').toBe(
      'CLIENT KILL ID 42',
    );
    expect(step).toMatchObject({ kind: 'engine', connection: cacheLocal.id, writes: true });
  });

  it('the Log line is the step’s text, CLIENT KILL ID 42', () => {
    expect(planOf(killing(client42)).steps[0]?.text).toBe('CLIENT KILL ID 42');
  });

  it('after Disconnect: 1 says Disconnected client 42., 0 says Client 42 was already gone., then the clients are read again', () => {
    expect(killNotification(1, '42')).toEqual({ kind: 'notify', level: 'success', text: 'Disconnected client 42.' });
    expect(killNotification(0, '42')).toEqual({ kind: 'notify', level: 'info', text: 'Client 42 was already gone.' });
    expect(planOf(killing(client42)).after).toEqual([
      {
        kind: 'start',
        feature: 'server.read-clients',
        target: { kind: 'connection', connection: cacheLocal.id },
        args: { connection: cacheLocal.id, own: '149' },
      },
    ]);
  });

  it('the confirmation of a client with flags=S has the sentence about the replica; with M, about the master', () => {
    const danger = (flags: string) => {
      const shown = planOf(killing({ ...client42, flags })).danger;
      return shown.kind === 'confirm' ? shown.text : '';
    };
    expect(danger('S')).toContain('This client is a replica: it will connect again and may copy the whole dataset.');
    expect(danger('M')).toContain(
      'This is the link to the master: this server stops replicating until it connects again.',
    );
    expect(danger('b')).not.toContain('replica');
  });

  it('disconnecting the client named datardo-pubsub is allowed', () => {
    expect(killing({ ...client42, id: '77', name: 'datardo-pubsub' }).kind).toBe('run');
  });

  it('on Cache production nothing is sent and the refusal is server.kill-client/read-only', () => {
    expect(killing(client42, cacheProduction)).toEqual({
      kind: 'refuse',
      code: 'server.kill-client/read-only',
      message: 'The connection Cache production is read-only.',
    });
  });

  it('the page’s own client is refused with server.kill-client/own-connection', () => {
    expect(killing({ ...client42, id: '149' })).toEqual({
      kind: 'refuse',
      code: 'server.kill-client/own-connection',
      message: 'This is the connection Datardo reads this page with. Use Disconnect in the connection island.',
    });
  });

  it('no operation is added to the undo history: the plan cannot be undone and says why', () => {
    expect(planOf(killing(client42)).undo).toEqual({
      cannot:
        'A closed connection cannot be opened again from the server, and what the client had not finished is lost.',
    });
  });
});
