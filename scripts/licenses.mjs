// R1.2: every package that ends up in the application, direct or not, has a license of the list of D22.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/** The licenses decisions D22 and D47 allow, as SPDX identifiers. */
export const allowedLicenses = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  // D47: tweetnacl, which ssh2 needs.
  'Unlicense',
];

const root = join(import.meta.dirname, '..');
const result = spawnSync(
  'npx',
  [
    'license-checker-rseidelsohn',
    '--production',
    '--excludePrivatePackages',
    '--onlyAllow',
    `"${allowedLicenses.join(';')}"`,
    '--summary',
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exit(result.status ?? 1);
