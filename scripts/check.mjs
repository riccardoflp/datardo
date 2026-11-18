// npm run check: every check of code-rules.md that a command can run, in the order of its table, and the project's
// own checks (scripts/own-checks.mjs). Stops at the first check that fails and says which.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ownProblems } from './own-checks.mjs';

const root = join(import.meta.dirname, '..');
const python = process.platform === 'win32' ? 'python' : 'python3';

function run(title, commandLine) {
  process.stdout.write(`\n== ${title}\n`);
  const result = spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.stderr.write(`\nThe check "${title}" failed.\n`);
    process.exit(1);
  }
}

function ownChecks() {
  process.stdout.write('\n== scripts/own-checks.mjs\n');
  const problems = ownProblems(root);
  for (const problem of problems) {
    process.stderr.write(`${problem}\n`);
  }
  if (problems.length > 0) {
    process.stderr.write('\nThe check "scripts/own-checks.mjs" failed.\n');
    process.exit(1);
  }
  process.stdout.write('no problems\n');
}

run('types', 'npx tsc --noEmit -p tsconfig.json');
run('lint', 'npx eslint --max-warnings 0 .');
run('styles', 'npx stylelint "src/**/*.css"');
run('format', 'npx prettier --check .');
run('layers', 'npx depcruise src --config .dependency-cruiser.cjs');
run('licenses', 'node scripts/licenses.mjs');
ownChecks();
run('catalog', `${python} -B scripts/check_catalog.py docs`);
run('unit tests', 'npx vitest run --project unit');
process.stdout.write('\nEvery check passed.\n');
