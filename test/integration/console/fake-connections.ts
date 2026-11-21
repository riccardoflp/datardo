/**
 * What `src/main/connections.ts` gives the consoles, for the tests against the test Redis: the engines of the test,
 * the saved connections, and the settings of a client with the test server's address. The real module reads the
 * secret storage of Electron, which a test does not have.
 */
import type { ClientSettings, EngineService } from '../../../src/engines';
import type { ConnectionView } from '../../../src/shared/connection';
import type { ConnectionId } from '../../../src/shared/ids';

let engines: EngineService | undefined;
let saved: readonly ConnectionView[] = [];
let address = '';

/** The engines, the connections and the address the fakes give. */
export function useFakes(given: {
  readonly engines: EngineService;
  readonly saved: readonly ConnectionView[];
  readonly url: string;
}): void {
  engines = given.engines;
  saved = given.saved;
  address = given.url;
}

/** The engines of the test. */
export function connectionEngines(): EngineService {
  if (engines === undefined) {
    throw new Error('useFakes was not called.');
  }
  return engines;
}

/** A saved connection by its id. */
export function findConnection(id: ConnectionId): ConnectionView | undefined {
  return saved.find((each) => each.id === id);
}

/** The connection string of the test server, with the database of the connection. */
export function fullConnectionString(id: ConnectionId): string | undefined {
  const connection = findConnection(id);
  return connection === undefined ? undefined : address;
}

/** What a client of the connection is opened with. */
export function clientSettings(connection: ConnectionView, connectTimeoutMs: number): ClientSettings | undefined {
  const connectionString = fullConnectionString(connection.id);
  return connectionString === undefined ? undefined : { engine: 'redis', connectionString, connectTimeoutMs };
}
