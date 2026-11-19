import { describe, expect, it } from 'vitest';
import { members } from '../../../src/features/monitor/replication-lag';
import type { Json } from '../../../src/shared/engine-request';
import { date, int, recorded } from './context';

function member(id: number, state: string, optime: string, extra: Record<string, Json> = {}): Json {
  return {
    _id: int(id),
    name: `m${String(id)}:27017`,
    stateStr: state,
    health: int(1),
    optimeDate: date(optime),
    ...extra,
  };
}

describe('monitor.replication-lag', () => {
  it('gives lags 0, 0 and 8 with the primary at 14:00:10 and secondaries at 14:00:10 and 14:00:02', () => {
    const found = members(
      [
        member(0, 'PRIMARY', '2026-11-17T14:00:10Z'),
        member(1, 'SECONDARY', '2026-11-17T14:00:10Z'),
        member(2, 'SECONDARY', '2026-11-17T14:00:02Z'),
      ],
      [],
    );
    expect(found.map((each) => each.lagSeconds)).toEqual([0, 0, 8]);
  });

  it('takes the latest member as the reference without a primary: lags 0 and 6', () => {
    const found = members(
      [member(0, 'SECONDARY', '2026-11-17T14:00:10Z'), member(1, 'SECONDARY', '2026-11-17T14:00:04Z')],
      [],
    );
    expect(found.map((each) => each.lagSeconds)).toEqual([0, 6]);
  });

  it('gives an arbiter with optimeDate in 1970 no lag and no last applied', () => {
    const [arbiter] = members([member(0, 'ARBITER', '1970-01-01T00:00:00Z')], []);
    expect(arbiter?.lagSeconds).toBeUndefined();
    expect(arbiter?.lastApplied).toBeUndefined();
    expect(arbiter?.arbiter).toBe(true);
  });

  it('gives lag 0 to a secondary ahead of the primary by 1 second', () => {
    const found = members(
      [member(0, 'PRIMARY', '2026-11-17T14:00:10Z'), member(1, 'SECONDARY', '2026-11-17T14:00:11Z')],
      [],
    );
    expect(found[1]?.lagSeconds).toBe(0);
  });

  it('pairs a status member with the configuration member of its _id', () => {
    const [found] = members(
      [member(2, 'SECONDARY', '2026-11-17T14:00:00Z')],
      [
        {
          _id: int(2),
          priority: int(0),
          hidden: true,
          secondaryDelaySecs: int(3600),
          tags: { dc: 'east' },
          votes: int(1),
        },
      ],
    );
    expect(found).toMatchObject({ priority: 0, hidden: true, delaySeconds: 3600, tags: [['dc', 'east']], votes: 1 });
  });

  it('takes slaveDelay: 600 as a delay of 600 seconds without secondaryDelaySecs', () => {
    const [found] = members([member(1, 'SECONDARY', '2026-11-17T14:00:00Z')], [{ _id: int(1), slaveDelay: int(600) }]);
    expect(found?.delaySeconds).toBe(600);
  });

  it('gives a status member without a configuration member its state and lag and no priority', () => {
    const [found] = members([member(5, 'PRIMARY', '2026-11-17T14:00:00Z')], [{ _id: int(1), priority: int(1) }]);
    expect(found).toMatchObject({ state: 'PRIMARY', lagSeconds: 0 });
    expect(found?.priority).toBeUndefined();
  });

  it('says healthy for health 1, no heartbeat for 1970, the infoMessage else lastHeartbeatMessage', () => {
    const [down, quiet] = members(
      [
        member(0, 'SECONDARY', '2026-11-17T14:00:00Z', {
          health: int(0),
          lastHeartbeat: date('1970-01-01T00:00:00Z'),
          lastHeartbeatMessage: 'Connection refused',
        }),
        member(1, 'SECONDARY', '2026-11-17T14:00:00Z', { infoMessage: 'syncing', lastHeartbeatMessage: 'other' }),
      ],
      [{ _id: int(1), buildIndexes: false }],
    );
    expect(down).toMatchObject({ healthy: false, message: 'Connection refused' });
    expect(down?.lastHeartbeat).toBeUndefined();
    expect(quiet).toMatchObject({ healthy: true, message: 'syncing', buildIndexes: false });
  });

  it('reads the recorded replSetGetStatus and replSetGetConfig of a one-member set', () => {
    const status = recorded('repl-set-get-status') as { members: Json[] };
    const config = recorded('repl-set-get-config') as { config: { members: Json[] } };
    const [self] = members(status.members, config.config.members);
    expect(self).toMatchObject({ state: 'PRIMARY', healthy: true, self: true, lagSeconds: 0, priority: 1, votes: 1 });
  });
});
