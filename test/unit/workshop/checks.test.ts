import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDependencies, checkFeatureModules, checkTodos } from '../../../scripts/own-checks.mjs';

const root = join(import.meta.dirname, '..', '..', '..');
const folders: string[] = [];

async function repository(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'datardo-check-'));
  folders.push(folder);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text, 'utf8');
  }
  return folder;
}

const index = [
  '| Feature | Title | Kind | Milestone | Status |',
  '| --- | --- | --- | --- | --- |',
  '| [`window.zoom`](window.md#x) | Zoom | Operation | M1 | Built |',
  '| [`window.theme`](window.md#y) | Theme | Operation | M1 | Specified |',
].join('\n');

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('the checks of the workshop', () => {
  it('fail on a dependency that D22 does not list', async () => {
    const folder = await repository({
      'package.json': JSON.stringify({ dependencies: { react: '1', lodash: '4', '@codemirror/view': '6' } }),
    });
    expect(checkDependencies(folder)).toEqual(['R1.1: lodash is not a dependency of D22.']);
  });

  it('fail on a built card without its module, and on a module of no card', async () => {
    const folder = await repository({
      'docs/features/README.md': index,
      'src/features/window/theme.ts': '/** Feature: window.theme */\n',
      'src/features/window/stray.ts': '/** Feature: window.stray */\n',
    });
    expect(checkFeatureModules(folder)).toEqual([
      `R2.1: ${join('src', 'features', 'window', 'stray.ts')} is the module of no card.`,
      'R2.1: window.zoom is built but src/features/window/zoom.ts is missing.',
    ]);
  });

  it('fail on a TODO that names no open question', async () => {
    const folder = await repository({
      'src/main/a.ts': '// TODO Q19: one tab per collection\n// TODO later\n',
    });
    expect(checkTodos(folder)).toEqual([`R8.2: ${join('src', 'main', 'a.ts')}:2: a TODO names an open question (Qn).`]);
  });

  it('fail on an import from src/features to src/engines', async () => {
    const folder = await repository({
      'src/engines/mongodb/connect.ts': 'export const connect = 1;\n',
      'src/features/document/delete.ts':
        "import { connect } from '../../engines/mongodb/connect';\nexport const x = connect;\n",
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' } }),
    });
    const report = (): string => {
      try {
        return execFileSync(
          process.execPath,
          [
            join(root, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs'),
            'src',
            '--config',
            join(root, '.dependency-cruiser.cjs'),
          ],
          { cwd: folder, encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (error: unknown) {
        return `failed: ${String((error as { stdout?: unknown }).stdout)}`;
      }
    };
    expect(report()).toMatch(/^failed: [\s\S]*features-use-shared-only/);
  }, 30_000);
});
