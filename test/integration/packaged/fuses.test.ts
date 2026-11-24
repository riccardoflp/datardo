/**
 * The packaged application's fuses (R14.12, T23; platform.md, "The packaged application"): read from its binary with
 * `npx @electron/fuses read --app`, and tried: started with `ELECTRON_RUN_AS_NODE=1`, `NODE_OPTIONS` and `--inspect`,
 * it opens its window and runs no code of the caller's. The binary is `DATARDO_TEST_PACKAGED`, else the one
 * `npm run package` left in `release/`; without one the tests are skipped.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Where `npm run package` leaves the binary on each system. */
function packagedBinary(): string | undefined {
  const named = process.env['DATARDO_TEST_PACKAGED'];
  if (named !== undefined && named !== '') {
    return resolve(named);
  }
  const release = resolve('release');
  const found = {
    win32: join(release, 'win-unpacked', 'Datardo.exe'),
    darwin: join(release, 'mac-universal', 'Datardo.app', 'Contents', 'MacOS', 'Datardo'),
  }[process.platform as string];
  const path = found ?? join(release, 'linux-unpacked', 'datardo');
  return existsSync(path) ? path : undefined;
}

const binary = packagedBinary();
const run = promisify(execFile);
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'datardo-packaged-'));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe.skipIf(binary === undefined)('the packaged application', () => {
  it('has the fuses of platform.md, as npx @electron/fuses read lists them', async () => {
    const { stdout } = await run('npx', ['@electron/fuses', 'read', '--app', binary ?? ''], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      shell: process.platform === 'win32',
    });
    const fuses = Object.fromEntries(
      [...stdout.matchAll(/^\s*(\w+) is (Enabled|Disabled)$/gmu)].map((line): [string, string] => [
        line[1] ?? '',
        line[2] ?? '',
      ]),
    );
    expect(fuses).toMatchObject({
      RunAsNode: 'Disabled',
      EnableNodeOptionsEnvironmentVariable: 'Disabled',
      EnableNodeCliInspectArguments: 'Disabled',
      OnlyLoadAppFromAsar: 'Enabled',
      EnableCookieEncryption: 'Enabled',
      EnableEmbeddedAsarIntegrityValidation: 'Disabled',
      GrantFileProtocolExtraPrivileges: 'Enabled',
    });
  });

  it('started with ELECTRON_RUN_AS_NODE=1, NODE_OPTIONS and --inspect, opens its window and runs none of it', async () => {
    const data = join(folder, 'data');
    const marker = join(folder, 'required');
    const required = join(folder, 'required.cjs');
    await writeFile(required, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);
    // A runner without unprivileged user namespaces cannot start Chromium's sandbox: it is not what is tried here.
    const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
    const started = spawn(binary ?? '', [...sandbox, '--inspect=0', '-e', "process.stdout.write('ran as node')"], {
      env: {
        ...process.env,
        DATARDO_DATA: data,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_OPTIONS: `--require ${JSON.stringify(required)}`,
      },
    });
    let said = '';
    started.stdout.on('data', (chunk: Buffer) => (said += chunk.toString()));
    started.stderr.on('data', (chunk: Buffer) => (said += chunk.toString()));
    const ended = new Promise<number | null>((done) => {
      started.on('exit', (code) => {
        done(code);
      });
    });
    try {
      // Electron's session folder is made only by the application, never by a plain Node.js.
      await expect
        .poll(() => readdir(data).catch(() => [] as string[]), { timeout: 30_000, interval: 250 })
        .toContain('chromium');
      expect(started.exitCode).toBeNull();
    } finally {
      // Datardo asks before it quits: it is ended without asking.
      started.kill('SIGKILL');
      await ended;
    }
    expect(said).not.toContain('ran as node');
    expect(said).not.toContain('Debugger listening');
    expect(existsSync(marker)).toBe(false);
  }, 60_000);
});
