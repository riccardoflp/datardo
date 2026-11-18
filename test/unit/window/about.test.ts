import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/window/about';
import { stateWith } from './context';

const app = {
  version: '1.0.0',
  system: 'Windows 11 x64',
  runtime: { electron: '44.1.0', chromium: '140.0.7339.80', node: '24.5.0' },
  dataFolder: 'C:\\Users\\riccardo\\AppData\\Roaming\\Datardo',
};
const repository = 'https://github.com/riccardoflp/datardo';

describe('window.about', () => {
  it('shows Datardo followed by its version, and the versions of Electron, Chromium and Node.js', () => {
    const about = view(stateWith({ app }), { repository });
    expect(about.name).toBe('Datardo 1.0.0');
    expect(about.runtime).toBe('MongoDB and Redis client. Electron 44.1.0, Chromium 140.0.7339.80, Node.js 24.5.0.');
    expect(about.system).toBe('Windows 11 x64');
    expect(about.dataFolder.path).toBe(app.dataFolder);
  });

  it('copies four lines, and nothing that names the user or a connection', () => {
    const lines = view(stateWith({ app }), { repository }).copyText.split('\n');
    expect(lines).toEqual([
      'Datardo 1.0.0',
      'MongoDB and Redis client.',
      'Electron 44.1.0, Chromium 140.0.7339.80, Node.js 24.5.0.',
      'Windows 11 x64',
    ]);
    expect(lines.join('\n')).not.toContain('riccardo');
  });

  it('links Documentation and Report an issue to the repository', () => {
    const links = view(stateWith({ app }), { repository }).links;
    expect(links.map((link) => [link.title, link.intent.args])).toEqual([
      ['Documentation', { address: `${repository}#readme` }],
      ['Report an issue', { address: `${repository}/issues` }],
    ]);
    expect(links.every((link) => link.element === 'window.open-link@dialog')).toBe(true);
  });

  it('offers no link and no check in a build that knows no repository', () => {
    const about = view(stateWith({ app }), { repository: undefined });
    expect(about.links).toEqual([]);
    expect(about.check).toBeUndefined();
  });

  it('before any check, has Check for updates and no line about versions', () => {
    const about = view(stateWith({ app }), { repository });
    expect(about.check?.title).toBe('Check for updates');
    expect(about.update).toBeUndefined();
  });

  it('after a check that found 1.1.0 while 1.0.0 runs, shows Datardo 1.1.0 is available. with Download', () => {
    const address = `${repository}/releases/tag/v1.1.0`;
    const state = stateWith({
      app,
      runner: { remembered: { 'window.check-update': { version: '1.1.0', current: '1.0.0', page: address } } },
    });
    const update = view(state, { repository }).update;
    expect(update?.text).toBe('Datardo 1.1.0 is available.');
    expect(update?.download?.title).toBe('Download');
    expect(update?.download?.intent.args).toEqual({ address });
  });

  it('after a check that found nothing newer, says Datardo 1.0.0 is the latest version.', () => {
    const state = stateWith({
      app,
      runner: { remembered: { 'window.check-update': { kind: 'latest', version: '1.0.0' } } },
    });
    expect(view(state, { repository }).update).toEqual({ text: 'Datardo 1.0.0 is the latest version.' });
  });

  it('downloads from the releases page when the release gave no page of the repository', () => {
    const state = stateWith({
      app,
      runner: { remembered: { 'window.check-update': { version: '1.1.0', current: '1.0.0', page: null } } },
    });
    expect(view(state, { repository }).update?.download?.intent.args).toEqual({ address: `${repository}/releases` });
  });

  it('opens the data folder from Open', () => {
    expect(view(stateWith({ app }), { repository }).dataFolder.open.intent.feature).toBe('window.open-data-folder');
  });
});
