/**
 * What a UI test of the runner needs and the product never has: a feature that asks a question, makes a read and runs
 * a plan of three steps whose danger is *destructive*, and connections that only record what they are sent. Added to
 * the runner's ports only when `DATARDO_TEST=1` (`src/main/bridge.ts`); never in the shipped list of features.
 */
import type { AppAction, RunnerPorts } from '../runner/ports';
import { redisCommand, type Json } from '../shared/engine-request';
import { ask, needRead, run, type OperationFeature, type ReadFeature, type RunnableFeature } from '../shared/feature';
import { connectionId, featureId, type ConnectionId, type FeatureId } from '../shared/ids';

/** The connections of the tests: one that writes, one read-only, one whose steps take long. */
const testConnections: Readonly<Record<string, string>> = {
  'test-local': 'Test',
  'test-read-only': 'Production',
  'test-slow': 'Slow',
};

function textArg(args: Json, name: string, otherwise: string): string {
  const value =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? (args as Record<string, Json>)[name]
      : undefined;
  return typeof value === 'string' ? value : otherwise;
}

/** Asks a name, reads how many keys it has, then deletes three keys after the user types the name. */
const destroy: OperationFeature = {
  kind: 'operation',
  id: featureId('test.destroy'),
  plan: (_context, answers) => {
    const args = (answers['args'] ?? null) as Json;
    const connection = connectionId(textArg(args, 'connection', 'test-local'));
    const name = answers['name'];
    if (typeof name !== 'string') {
      return ask({
        title: 'Destroy test keys',
        text: 'The keys of this name are deleted.',
        button: 'Choose',
        fields: [
          {
            kind: 'text',
            key: 'name',
            label: 'Name',
            default: 'orders',
            rules: [{ kind: 'not-empty', message: 'Enter a name.' }],
          },
        ],
      });
    }
    if (typeof answers['count'] !== 'number') {
      return needRead('count', 'test.count', { name });
    }
    return run({
      title: 'Destroy test keys',
      steps: [1, 2, 3].map((index) => ({
        kind: 'engine' as const,
        connection,
        writes: true,
        request: redisCommand(0, 'DEL', `${name}:${String(index)}`),
        text: `DEL ${name}:${String(index)}`,
      })),
      danger: { kind: 'destructive', text: `Delete the keys of ${name}?`, button: 'Delete', name },
      touches: `${String(answers['count'])} keys`,
      undo: { cannot: 'Test keys are not kept in the undo history.' },
      publishes: false,
      after: [{ kind: 'notify', level: 'success', text: `Deleted 3 keys of ${name}.` }],
    });
  },
};

/** How many keys a name has: always 3. */
const count: ReadFeature = {
  kind: 'read',
  id: featureId('test.count'),
  request: (_context, args) => ({ kind: 'app', action: 'test.count', args }),
  parse: (replies) => replies[0],
};

/** The commands the test connections were sent, in order. */
const sentRead: ReadFeature = {
  kind: 'read',
  id: featureId('test.sent'),
  request: () => ({ kind: 'app', action: 'test.sent', args: null }),
  parse: (replies) => replies[0],
};

/** The ports of the runner with the test features, the test connections and the actions that read what was sent. */
export function withTestFeatures(ports: RunnerPorts): RunnerPorts {
  const sent: string[] = [];
  const features = new Map<FeatureId, RunnableFeature>([
    ...ports.features,
    [destroy.id, destroy],
    [count.id, count],
    [sentRead.id, sentRead],
  ]);
  const actions = new Map<string, AppAction>([
    ...ports.appActions,
    ['test.count', () => Promise.resolve(3)],
    ['test.sent', () => Promise.resolve([...sent])],
  ]);
  const isTest = (connection: ConnectionId): boolean => connection in testConnections;
  return {
    ...ports,
    features,
    appActions: actions,
    engines: {
      send: async (request, signal) => {
        if (!isTest(request.connection)) {
          return ports.engines.send(request, signal);
        }
        if (request.request.engine === 'redis') {
          sent.push(request.request.command.map((word) => new TextDecoder().decode(word)).join(' '));
        }
        await new Promise((resolve) => setTimeout(resolve, request.connection === 'test-slow' ? 1500 : 10));
        return 1;
      },
    },
    isConnected: (connection) => isTest(connection) || ports.isConnected?.(connection) !== false,
    isReadOnly: (connection) => connection === 'test-read-only' || ports.isReadOnly(connection),
    connectionName: (connection) => testConnections[connection] ?? ports.connectionName(connection),
  };
}
