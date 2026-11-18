/**
 * The SSH tunnel's place in the engines: a local port forwarded through an SSH server to the host of the connection
 * (connection.ssh-tunnel-target). The tunnel itself comes with milestone M7; until then a connection with an SSH tunnel
 * is refused when it connects, with a message that says so.
 */
import type { ClientSsh } from '../engine';
import { EngineError } from '../engine';

/** Where the tunnel leads. */
export interface TunnelTarget {
  readonly host: string;
  readonly port: number;
}

/** An open tunnel: the local port to connect to, and how it ends. */
export interface Tunnel {
  readonly localPort: number;
  readonly close: () => void;
  /** Calls `listener` once when the SSH connection ends. */
  readonly onClose: (listener: (reason: string) => void) => void;
}

/** Opens a tunnel through the SSH server to the target. */
export type OpenTunnel = (ssh: ClientSsh, target: TunnelTarget, signal: AbortSignal) => Promise<Tunnel>;

/** Until M7: no tunnel can be opened. */
export const noTunnel: OpenTunnel = () => Promise.reject(tunnelNotYet());

/** The error of a connection with an SSH tunnel, until tunnels exist. */
export function tunnelNotYet(): EngineError {
  return new EngineError('SSH tunnels are not supported yet: turn the SSH tunnel off to connect.');
}
