import { describe, expect, it } from 'vitest';
import * as checkUpdate from '../../../src/features/window/check-update';
import {
  isNewer,
  newerVersionLine,
  parse,
  request,
  versionOf,
  type ReleaseReply,
} from '../../../src/features/window/check-update';
import { start } from '../../../src/runner/start';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, ReadFeature } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { product } from '../../../src/shared/product';
import { initialState } from '../../../src/shared/state';
import { appTarget } from '../../../src/shared/target';
import { harness } from './harness';

const repository = 'https://github.com/owner/datardo';
const feature: ReadFeature = { kind: 'read', id: featureId('window.check-update'), ...checkUpdate };
const running = { ...initialState, app: { ...initialState.app, version: '1.2.0' } };

function reply(body: Json | string, status = 200): ReleaseReply {
  return { kind: 'reply', status, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

/** Starts the check with GitHub answering `answer`, and gives what the user sees. */
function checker(answers: () => ReleaseReply): {
  check: (by: 'start' | 'user') => Promise<unknown>;
  requests: Json[];
  test: ReturnType<typeof harness>;
} {
  const requests: Json[] = [];
  const test = harness({
    features: [feature],
    state: running,
    appActions: {
      'window.fetch-latest-release': (args) => {
        requests.push(args);
        return Promise.resolve(answers());
      },
    },
  });
  return {
    requests,
    test,
    check: (by) => start(test.ports, { feature: feature.id, target: appTarget, args: { by, repository } }),
  };
}

const context: Context = {
  feature: feature.id,
  now: 0,
  platform: 'windows',
  startedBy: 'user',
  target: appTarget,
  state: running,
};

describe('window.check-update', () => {
  it('asks the latest release of the repository with Datardo/<version> and nothing that names the user', () => {
    expect(request(context, { by: 'start', repository })).toEqual({
      kind: 'app',
      action: 'window.fetch-latest-release',
      args: {
        url: 'https://api.github.com/repos/owner/datardo/releases/latest',
        userAgent: 'Datardo/1.2.0',
        timeLimitMs: 10_000,
        largestReplyBytes: 1_048_576,
      },
    });
    const asked = request(context, { by: 'start' });
    const expected = product.repository === undefined ? null : checkUpdate.releaseAddress(product.repository);
    expect(asked).toMatchObject({ args: { url: expected } });
  });

  it('says Datardo 1.3.0 is available with Download when 1.2.0 runs, and nothing for v1.2.0 or v1.1.9', async () => {
    for (const [tag, shown] of [
      ['v1.3.0', 1],
      ['v1.2.0', 0],
      ['v1.1.9', 0],
    ] as const) {
      const { check, test } = checker(() => reply({ tag_name: tag, html_url: `${repository}/releases/tag/${tag}` }));
      await check('start');
      expect(test.state().runner.notifications).toHaveLength(shown);
    }
    const { check, test } = checker(() => reply({ tag_name: 'v1.3.0', html_url: `${repository}/releases/tag/v1.3.0` }));
    await check('start');
    expect(test.state().runner.notifications[0]).toMatchObject({
      level: 'info',
      text: 'Datardo 1.3.0 is available. You have 1.2.0.',
      actions: [
        {
          label: 'Download',
          element: 'window.open-link@notification',
          feature: 'window.open-link',
          args: { address: `${repository}/releases/tag/v1.3.0` },
        },
      ],
    });
    expect(newerVersionLine(test.state().runner.remembered)).toBe('Datardo 1.3.0 is available. You have 1.2.0.');
  });

  it('says 1.10.0 is newer than 1.9.0, and gives no version for a tag, a text or a reply that has none', () => {
    expect(isNewer([1, 10, 0], [1, 9, 0])).toBe(true);
    expect(isNewer([1, 9, 0], [1, 10, 0])).toBe(false);
    expect(versionOf('nightly')).toBeUndefined();
    const args = { by: 'user', repository };
    expect(parse([reply({ tag_name: 'nightly' })], args)).toMatchObject({ kind: 'failed' });
    expect(parse([reply('not JSON')], args)).toMatchObject({ kind: 'failed' });
    expect(parse([reply({ name: 'Release' })], args)).toMatchObject({ kind: 'failed' });
  });

  it('opens html_url when it is a page of the repository, and the releases page otherwise', () => {
    const args = { by: 'user', repository };
    expect(parse([reply({ tag_name: 'v1.3.0', html_url: `${repository}/releases/tag/v1.3.0` })], args)).toMatchObject({
      page: `${repository}/releases/tag/v1.3.0`,
    });
    expect(parse([reply({ tag_name: 'v1.3.0', html_url: 'https://example.com/x' })], args)).toMatchObject({
      page: `${repository}/releases`,
    });
  });

  it('writes one line in the Log for a check at start with no network, and answers Check for updates', async () => {
    const { check, test } = checker(() => ({ kind: 'error', reason: 'network' }));
    await check('start');
    expect(test.state().runner.notifications).toEqual([]);
    expect(test.log()).toEqual([
      '[window.check-update] Could not check for a newer version: the network could not be reached.',
    ]);
    await check('user');
    expect(test.state().runner.notifications.at(-1)).toMatchObject({
      level: 'warning',
      text: 'Could not check for a newer version: the network could not be reached.',
    });
  });

  it('shows one notification for two checks in one run that find 1.3.0', async () => {
    const { check, test } = checker(() => reply({ tag_name: 'v1.3.0' }));
    await check('start');
    await check('start');
    expect(test.state().runner.notifications).toHaveLength(1);
    expect(test.state().runner.notifications[0]?.count).toBe(1);
  });

  it('sends one request for Check for updates and answers, whatever the setting', async () => {
    const { check, test, requests } = checker(() => reply({ tag_name: 'v1.2.0' }));
    await check('user');
    expect(requests).toHaveLength(1);
    expect(test.state().runner.notifications.at(-1)).toMatchObject({
      level: 'success',
      text: 'Datardo 1.2.0 is the latest version.',
    });
  });

  it('says it could not check when this build does not know its repository', () => {
    const result = parse([{ kind: 'no-request' }], { by: 'user' });
    expect(checkUpdate.after(result, context)).toEqual([
      {
        kind: 'notify',
        level: 'warning',
        text: 'Could not check for a newer version: this build of Datardo does not know its repository.',
      },
    ]);
    expect(checkUpdate.after(parse([{ kind: 'no-request' }], { by: 'start' }), context)).toEqual([]);
  });
});
