// npm run dev: starts Datardo from the sources, with its data in ./.data so that it never touches an installed one.
// Arguments after `--` go to Electron: `npm run dev -- --password-store=gnome-libsecret`.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const forwarded = process.argv.slice(2);
const child = spawn('npx', ['electron-vite', 'dev', ...(forwarded.length > 0 ? ['--', ...forwarded] : [])], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATARDO_DATA: process.env.DATARDO_DATA ?? join(root, '.data') },
});
child.on('exit', (code) => process.exit(code ?? 0));
