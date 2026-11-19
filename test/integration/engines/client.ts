/**
 * A client of the MongoDB engine for the tests of its methods: requests on one database, sent through the engines as
 * the runner sends them, with every value as canonical Extended JSON.
 */
import { createEngines, type ClientSettings } from '../../../src/engines';
import type { MongoRequest } from '../../../src/shared/engine-request';
import { connectionId } from '../../../src/shared/ids';

/** What a test gives of a request: the method, its arguments, and the rest when it needs them. */
export type Asked = Omit<MongoRequest, 'engine' | 'database'> & { readonly database?: string };

/** A client on one database. */
export interface TestClient {
  readonly send: (asked: Asked) => Promise<unknown>;
  /** The error a request fails with; `undefined` when it does not fail. */
  readonly failure: (asked: Asked) => Promise<(Error & Record<string, unknown>) | undefined>;
  readonly close: () => Promise<void>;
}

/** `{ $numberInt: "7" }`. */
export function int(value: number): { readonly $numberInt: string } {
  return { $numberInt: String(value) };
}

/** Opens a client of the engine on `uri`, whose requests name `database` unless they say another. */
export async function testClient(
  uri: string,
  database: string,
  more: Partial<ClientSettings> = {},
): Promise<TestClient> {
  const engines = createEngines();
  const id = connectionId(`c-${database}`);
  const settings: ClientSettings = { engine: 'mongodb', connectionString: uri, connectTimeoutMs: 10_000, ...more };
  await engines.connect(id, settings, AbortSignal.timeout(30_000));
  const send = (asked: Asked): Promise<unknown> =>
    engines.send({ connection: id, request: { engine: 'mongodb', database, ...asked } }, AbortSignal.timeout(30_000));
  return {
    send,
    failure: (asked) =>
      send(asked).then(
        () => undefined,
        (error: unknown) => error as Error & Record<string, unknown>,
      ),
    close: () => engines.disconnectAll(),
  };
}
