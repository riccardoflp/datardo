// Writes resources/notices.txt: the license of every package bundled into the application (R1.2), shipped with the
// installer and shown by About.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const result = spawnSync('npx', ['license-checker-rseidelsohn', '--production', '--excludePrivatePackages', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(1);
}
const packages = JSON.parse(result.stdout);
const parts = ['Datardo includes the following packages, under these licenses.', ''];
for (const name of Object.keys(packages).sort()) {
  const entry = packages[name];
  parts.push(`${name}: ${entry.licenses}`);
  if (entry.licenseFile !== undefined && !/readme/i.test(entry.licenseFile)) {
    parts.push('', readFileSync(entry.licenseFile, 'utf8').trim());
  }
  parts.push('', '-'.repeat(78), '');
}
writeFileSync(join(root, 'resources', 'notices.txt'), parts.join('\n'), 'utf8');
process.stdout.write(`wrote resources/notices.txt (${Object.keys(packages).length} packages)\n`);
