/**
 * The SSH tunnel against an SSH server of ssh2 in this process (testing.md): a MongoDB and a Redis server reached
 * through it, the host key asked the first time, connecting without asking after, and a changed key refused (R14.8).
 * The password of the tunnel is made here and never printed.
 */
import { createHash, randomBytes } from 'node:crypto';
import { connect as netConnect, type AddressInfo } from 'node:net';
import { Server, utils, type Connection } from 'ssh2';
import { afterEach, describe, expect, it } from 'vitest';
import { createEngines, type ClientSettings, type HostKeyCheck } from '../../../src/engines';
import { isTunnelProblem, throughTunnel, tunnelTarget } from '../../../src/features/connection/ssh-tunnel-target';
import * as trustHostKey from '../../../src/features/connection/trust-host-key';
import type { Context, StartedBy } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { pingRequest } from '../../../src/features/connection/state';
import { testServers } from '../servers';

const servers = testServers();
const password = randomBytes(12).toString('hex');
const signal = (): AbortSignal => AbortSignal.timeout(20_000);

interface SshServer {
  readonly port: number;
  readonly fingerprint: string;
  readonly forwards: string[];
  readonly close: () => Promise<void>;
}

function accept(client: Connection, forwards: string[]): void {
  client.on('error', () => undefined);
  client.on('authentication', (context) => {
    if (context.method === 'password' && context.username === 'ada' && context.password === password) {
      context.accept();
    } else {
      context.reject(['password']);
    }
  });
  client.on('ready', () => {
    client.on('tcpip', (acceptStream, _reject, info) => {
      forwards.push(`${info.destIP}:${String(info.destPort)}`);
      const stream = acceptStream();
      const socket = netConnect(info.destPort, info.destIP);
      socket.on('error', () => stream.destroy());
      stream.on('error', () => socket.destroy());
      stream.pipe(socket).pipe(stream);
    });
  });
}

/** An SSH server with a new host key, which forwards what it is asked to. */
async function sshServer(): Promise<SshServer> {
  const keys = utils.generateKeyPairSync('ed25519');
  const parsed = utils.parseKey(keys.public);
  if (parsed instanceof Error) {
    throw parsed;
  }
  const key = createHash('sha256').update(parsed.getPublicSSH()).digest('base64').replace(/=+$/, '');
  const forwards: string[] = [];
  const clients = new Set<Connection>();
  const server = new Server({ hostKeys: [keys.private] }, (client) => {
    clients.add(client);
    accept(client, forwards);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    fingerprint: `SHA256:${key}`,
    forwards,
    close: () =>
      new Promise((resolve) => {
        for (const client of clients) {
          client.end();
        }
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** The known hosts and the check of the main process, the feature deciding; a person trusts what it asks. */
function knownHosts(): {
  readonly hosts: Map<string, string>;
  readonly asked: string[];
  check: (by: StartedBy) => HostKeyCheck;
} {
  const hosts = new Map<string, string>();
  const asked: string[] = [];
  const check =
    (startedBy: StartedBy): HostKeyCheck =>
    (server, fingerprint) => {
      const key = trustHostKey.serverKey(server.host, server.port);
      const remembered = hosts.get(key);
      const context: Context = {
        feature: featureId('connection.trust-host-key'),
        now: 0,
        platform: 'windows',
        startedBy,
        target: { kind: 'app' },
        state: initialState,
      };
      const args = { host: server.host, port: server.port, fingerprint, ...(remembered ? { remembered } : {}) };
      let outcome = trustHostKey.plan(context, { args });
      if (outcome.kind === 'ask') {
        asked.push(outcome.question.title);
        outcome = trustHostKey.plan(context, { args, [trustHostKey.trustedAnswer]: true });
      }
      // A changed key is a confirmation, which this person dismisses.
      if (outcome.kind !== 'run' || outcome.plan.danger.kind !== 'none') {
        return Promise.resolve(false);
      }
      for (const step of outcome.plan.steps) {
        const { server: name, fingerprint: remember } = (
          step as unknown as { args: { server: string; fingerprint: string } }
        ).args;
        hosts.set(name, remember);
      }
      return Promise.resolve(true);
    };
  return { hosts, asked, check };
}

function throughSsh(
  engine: 'mongodb' | 'redis',
  connectionString: string,
  ssh: SshServer,
  hostKey: HostKeyCheck,
): ClientSettings {
  const target = tunnelTarget(engine, connectionString);
  if (isTunnelProblem(target)) {
    throw new Error(target.problem);
  }
  return {
    engine,
    connectionString,
    connectTimeoutMs: 5000,
    ssh: { host: '127.0.0.1', port: ssh.port, username: 'ada', authentication: 'password', password },
    through: { target, connectionString: (localPort) => throughTunnel(engine, connectionString, localPort) },
    hostKey,
  };
}

const opened: SshServer[] = [];

afterEach(async () => {
  for (const each of opened.splice(0)) {
    await each.close();
  }
});

describe('connection.trust-host-key', () => {
  it('asks the first time, connects without asking after, and refuses a changed key', async () => {
    const first = await sshServer();
    opened.push(first);
    const known = knownHosts();
    const engines = createEngines();
    const settings = throughSsh('mongodb', servers.mongoStandalone, first, known.check('user'));
    const client = await engines.open(settings, signal());
    await expect(client.send(pingRequest('mongodb'), signal())).resolves.toBeDefined();
    await client.close();
    expect(known.asked).toEqual([`Trust the SSH server 127.0.0.1:${String(first.port)}?`]);
    expect(known.hosts.get(`127.0.0.1:${String(first.port)}`)).toBe(first.fingerprint);

    const again = await engines.open(settings, signal());
    await again.close();
    expect(known.asked).toHaveLength(1);

    // The same address, another key: the server was reinstalled, or someone is in the middle.
    await first.close();
    opened.length = 0;
    const second = await sshServer();
    opened.push(second);
    known.hosts.set(`127.0.0.1:${String(second.port)}`, first.fingerprint);
    const changed = throughSsh('mongodb', servers.mongoStandalone, second, known.check('user'));
    await expect(engines.open(changed, signal())).rejects.toMatchObject({
      code: 'connection.connect/host-key',
      message: `SSH: the host key of 127.0.0.1:${String(second.port)} was not trusted`,
    });
    expect(second.forwards).toEqual([]);
  });

  it('a scheduled task does not ask: an unknown key is not trusted', async () => {
    const ssh = await sshServer();
    opened.push(ssh);
    const known = knownHosts();
    const settings = throughSsh('mongodb', servers.mongoStandalone, ssh, known.check('task'));
    await expect(createEngines().open(settings, signal())).rejects.toMatchObject({
      code: 'connection.connect/host-key',
    });
    expect(known.asked).toEqual([]);
    expect(known.hosts.size).toBe(0);
  });
});

describe('connection.ssh-tunnel-target', () => {
  it('reaches MongoDB through the tunnel at the host of the connection string', async () => {
    const ssh = await sshServer();
    opened.push(ssh);
    const known = knownHosts();
    const client = await createEngines().open(
      throughSsh('mongodb', servers.mongoStandalone, ssh, known.check('user')),
      signal(),
    );
    await client.close();
    const target = tunnelTarget('mongodb', servers.mongoStandalone);
    expect(isTunnelProblem(target) ? '' : ssh.forwards[0]).toBe(
      isTunnelProblem(target) ? '' : `${target.host}:${String(target.port)}`,
    );
  });

  it.runIf(servers.redis !== undefined)('reaches Redis through the tunnel', async () => {
    const ssh = await sshServer();
    opened.push(ssh);
    const known = knownHosts();
    const client = await createEngines().open(
      throughSsh('redis', servers.redis ?? '', ssh, known.check('user')),
      signal(),
    );
    try {
      expect(new TextDecoder().decode((await client.send(pingRequest('redis'), signal())) as Uint8Array)).toBe('PONG');
    } finally {
      await client.close();
    }
    expect(ssh.forwards.length).toBeGreaterThan(0);
  });

  it('fails with the reason when the SSH password is wrong', async () => {
    const ssh = await sshServer();
    opened.push(ssh);
    const known = knownHosts();
    const settings = throughSsh('mongodb', servers.mongoStandalone, ssh, known.check('user'));
    const ssh2 = settings.ssh ?? { host: '', port: 0, username: '', authentication: 'password' as const };
    const wrong: ClientSettings = { ...settings, ssh: { ...ssh2, password: 'not it' } };
    const error: unknown = await createEngines()
      .open(wrong, signal())
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(String(error)).toContain('SSH: authentication failed for ada@127.0.0.1');
    expect(String(error)).not.toContain(password);
  });
});
