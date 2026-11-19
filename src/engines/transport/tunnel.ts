/**
 * The SSH tunnel of a connection (connection.connect, connection.ssh-tunnel-target): a local port on `127.0.0.1`
 * forwarded through an SSH server to the host of the connection. The host key of the server is given to the check the
 * main process passes (connection.trust-host-key) before anything is sent.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, isIP, type AddressInfo, type Server } from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';
import type { ClientSettings, ClientSsh, EngineClient, HostKeyCheck, TunnelTarget } from '../engine';
import { EngineError } from '../engine';

/** An open tunnel: the local port to connect to, and how it ends. */
export interface Tunnel {
  readonly localPort: number;
  /** The last failure of a forwarded connection, to explain a client that could not connect through it. */
  readonly lastError: () => string | undefined;
  readonly close: () => void;
  /** Calls `listener` once when the SSH connection ends. */
  readonly onClose: (listener: (reason: string) => void) => void;
}

/** How long the SSH server has to answer and authenticate. */
export const sshReadyMs = 15_000;

/** How often a keepalive is sent to the SSH server. */
export const sshKeepaliveMs = 30_000;

/** The code of the refusal of a host key that is not trusted (connection.connect). */
export const hostKeyCode = 'connection.connect/host-key';

/** OpenSSH's fingerprint of a host key: `SHA256:` and the base64 of its SHA-256, without `=` padding. */
export function fingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function defaultAgent(): string | undefined {
  const socket = process.env['SSH_AUTH_SOCK'];
  if (socket !== undefined && socket !== '') {
    return socket;
  }
  return process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function authentication(ssh: ClientSsh): Partial<ConnectConfig> {
  switch (ssh.authentication) {
    case 'password':
      return { password: ssh.password ?? '' };
    case 'private-key': {
      const file = ssh.privateKeyFile ?? '';
      if (file === '') {
        throw new EngineError('SSH: no private key file.');
      }
      let privateKey: Buffer;
      try {
        privateKey = readFileSync(file);
      } catch (error: unknown) {
        throw new EngineError(`SSH: can't read the private key ${file}: ${reasonOf(error)}`);
      }
      return {
        privateKey,
        ...(ssh.passphrase === undefined || ssh.passphrase === '' ? {} : { passphrase: ssh.passphrase }),
      };
    }
    case 'agent': {
      const agent = defaultAgent();
      if (agent === undefined) {
        throw new EngineError('SSH: no SSH agent found (SSH_AUTH_SOCK is not set).');
      }
      return { agent };
    }
  }
}

/** The address of the SSH server as the messages and the known hosts name it: `<host>:<port>`. */
export function serverLabel(ssh: ClientSsh): string {
  return `${ssh.host}:${String(ssh.port)}`;
}

/** Connects to the SSH server, checking its host key, and authenticates. */
async function sshReady(ssh: ClientSsh, check: HostKeyCheck, signal: AbortSignal): Promise<Client> {
  const client = new Client();
  const label = serverLabel(ssh);
  let refusedKey = false;
  const config: ConnectConfig = {
    host: ssh.host,
    port: ssh.port,
    username: ssh.username,
    readyTimeout: sshReadyMs,
    keepaliveInterval: sshKeepaliveMs,
    hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
      check({ host: ssh.host, port: ssh.port }, fingerprint(key)).then(
        (trusted) => {
          refusedKey = !trusted;
          verify(trusted);
        },
        () => {
          refusedKey = true;
          verify(false);
        },
      );
    },
    ...authentication(ssh),
  };
  await new Promise<void>((resolve, reject) => {
    const cancel = (): void => {
      client.end();
      reject(new EngineError('Cancelled.'));
    };
    const fail = (error: Error): void => {
      signal.removeEventListener('abort', cancel);
      client.end();
      if (refusedKey || /verification failed/i.test(error.message)) {
        reject(new EngineError(`SSH: the host key of ${label} was not trusted`, hostKeyCode));
        return;
      }
      const reason = /All configured authentication methods failed/i.test(error.message)
        ? `authentication failed for ${ssh.username}@${label}`
        : error.message;
      reject(new EngineError(`SSH: ${reason}`));
    };
    client.once('ready', () => {
      signal.removeEventListener('abort', cancel);
      client.removeListener('error', fail);
      resolve();
    });
    client.once('error', fail);
    signal.addEventListener('abort', cancel, { once: true });
    client.connect(config);
  });
  return client;
}

function listen(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Opens the tunnel of the settings: the SSH connection, then the local port forwarded to the target. */
export async function openTunnel(settings: ClientSettings, signal: AbortSignal): Promise<Tunnel> {
  const { ssh, through } = settings;
  if (ssh === undefined || through === undefined) {
    throw new EngineError('The SSH tunnel has no target.');
  }
  if (through.problem !== undefined) {
    throw new EngineError(through.problem);
  }
  const check: HostKeyCheck = settings.hostKey ?? (() => Promise.resolve(false));
  const client = await sshReady(ssh, check, signal);
  return forward(client, serverLabel(ssh), through.target);
}

async function forward(client: Client, label: string, target: TunnelTarget): Promise<Tunnel> {
  let lastError: string | undefined;
  let closed = false;
  const listeners: ((reason: string) => void)[] = [];
  const server = createServer((socket) => {
    client.forwardOut(
      socket.remoteAddress ?? '127.0.0.1',
      socket.remotePort ?? 0,
      target.host,
      target.port,
      (error, stream) => {
        if (error !== undefined) {
          lastError = `${label} can't reach ${target.host}:${String(target.port)} (${error.message})`;
          socket.destroy();
          return;
        }
        socket.pipe(stream).pipe(socket);
        stream.on('error', () => socket.destroy());
        socket.on('error', () => stream.destroy());
      },
    );
  });
  const close = (reason: string): void => {
    if (closed) {
      return;
    }
    closed = true;
    server.close();
    client.end();
    for (const listener of listeners.splice(0)) {
      listener(reason);
    }
  };
  client.on('close', () => {
    close(`The SSH connection to ${label} was closed.`);
  });
  client.on('error', (error) => (lastError = error.message));
  const localPort = await listen(server).catch((error: unknown) => {
    close(reasonOf(error));
    throw error;
  });
  return {
    localPort,
    lastError: () => lastError,
    close: () => {
      close('closed');
    },
    onClose: (listener) => {
      if (closed) {
        listener('closed');
      } else {
        listeners.push(listener);
      }
    },
  };
}

/** The error of a client that could not connect through the tunnel: the forward's failure when there was one. */
export function throughError(tunnel: Tunnel, error: unknown): unknown {
  const reason = tunnel.lastError();
  return reason === undefined ? error : new EngineError(`SSH tunnel: ${reason}`);
}

/** Opens a client of the engine with the settings it is given, and the host its TLS certificate is checked against. */
export type OpenThrough = (settings: ClientSettings, servername: string | undefined) => Promise<EngineClient>;

/**
 * Opens a client directly, or, with an SSH tunnel, through it: the client connects to the local end, TLS still checks
 * the real host's name, closing the client closes the tunnel, and the end of the tunnel is a drop of the client.
 */
export async function openDirectOrThrough(
  settings: ClientSettings,
  signal: AbortSignal,
  open: OpenThrough,
): Promise<EngineClient> {
  if (settings.ssh === undefined) {
    return open(settings, undefined);
  }
  const tunnel = await openTunnel(settings, signal);
  const through = settings.through;
  if (through === undefined) {
    tunnel.close();
    throw new EngineError('The SSH tunnel has no target.');
  }
  let client: EngineClient;
  try {
    const servername = isIP(through.target.host) === 0 ? through.target.host : undefined;
    client = await open({ ...settings, connectionString: through.connectionString(tunnel.localPort) }, servername);
  } catch (error: unknown) {
    tunnel.close();
    throw throughError(tunnel, error);
  }
  return {
    send: client.send,
    close: async () => {
      await client.close();
      tunnel.close();
    },
    onDrop: (listener) => {
      client.onDrop(listener);
      tunnel.onClose(listener);
    },
  };
}
