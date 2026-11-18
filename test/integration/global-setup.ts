/**
 * Starts the throwaway servers once for all integration tests, and stops them at the end.
 */
import { startServers } from './servers';

export default async function setup(): Promise<() => Promise<void>> {
  const started = await startServers();
  process.env['DATARDO_TEST_SERVERS'] = JSON.stringify(started.servers);
  if (started.servers.redis === undefined) {
    console.warn(
      'No Redis server: the Redis integration tests are skipped. Set DATARDO_TEST_REDIS_URL or DATARDO_TEST_REDIS_BINARY.',
    );
  }
  return started.stop;
}
