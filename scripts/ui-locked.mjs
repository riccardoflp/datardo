/**
 * Builds Datardo and runs UI tests while no other run does: several people or agents working in one checkout share
 * `out/`, so a build and the tests that start it take a lock first (the folder `.ui-lock`). Arguments are passed to
 * Playwright: `node scripts/ui-locked.mjs test/ui/window`.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';

const lock = '.ui-lock';
const staleMs = 15 * 60 * 1000;

/** Whether the lock was left by a run that ended without removing it. */
function isStale() {
  try {
    return Date.now() - statSync(lock).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function take() {
  for (;;) {
    try {
      mkdirSync(lock);
      return;
    } catch {
      if (isStale()) {
        rmSync(lock, { recursive: true, force: true });
      } else {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      }
    }
  }
}

take();
let failed = false;
try {
  execSync('npx electron-vite build', { stdio: 'inherit' });
  execSync(['npx playwright test', ...process.argv.slice(2)].join(' '), { stdio: 'inherit' });
} catch {
  failed = true;
} finally {
  rmSync(lock, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
