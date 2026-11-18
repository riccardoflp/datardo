// The project's own checks, which no tool does: R1.1 the dependencies of D22, R2.1 a module for each built card and a
// card for each module, R8.2 TODOs that name an open question. Each returns the problems it found, as lines of text;
// scripts/check.mjs runs them, and test/unit/workshop/checks.test.ts tries them on folders made for the test.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** The dependencies decision D22 allows: names, or prefixes ending in `/` for families of packages. */
export const allowedDependencies = [
  'mongodb',
  'redis',
  'ssh2',
  'json5',
  'acorn',
  'chart.js',
  'react',
  'react-dom',
  '@radix-ui/',
  '@codemirror/',
  '@lezer/',
  '@tanstack/react-virtual',
  '@vscode/codicons',
];

function files(folder, extensions) {
  if (!existsSync(folder)) {
    return [];
  }
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** R1.1: the dependencies of the package.json in `root` that D22 does not list. */
export function checkDependencies(root) {
  const dependencies = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies ?? {});
  const allowed = (name) =>
    allowedDependencies.some((entry) => (entry.endsWith('/') ? name.startsWith(entry) : name === entry));
  return dependencies.filter((name) => !allowed(name)).map((name) => `R1.1: ${name} is not a dependency of D22.`);
}

/** The status of every card, from the index of the catalog. */
export function cardStatuses(root) {
  const index = readFileSync(join(root, 'docs', 'features', 'README.md'), 'utf8');
  const statuses = new Map();
  const row = /^\| \[`([a-z0-9-]+\.[a-z0-9-]+)`\]\([^)]*\) \| [^|]*\| (\w+) \|[^|]*\| (\w+) \|$/gm;
  for (const match of index.matchAll(row)) {
    statuses.set(match[1], match[3]);
  }
  return statuses;
}

/** Modules of src/features that are not a card's: the commands, the texts and the types an area shares. */
const sharedModules = new Set(['commands.ts', 'text.ts', 'types.ts', 'index.ts']);

/**
 * R2.1: a module of src/features/<area>/ that names no card, a built card's module that does not say its identifier,
 * and a built card with no module. The runner's cards live in src/runner, as their cards say.
 */
export function checkFeatureModules(root) {
  const problems = [];
  const statuses = cardStatuses(root);
  const featureFolder = join(root, 'src', 'features');
  const modules = new Set();
  for (const file of files(featureFolder, ['.ts', '.tsx'])) {
    const path = relative(featureFolder, file).split(sep);
    if (path.length !== 2 || sharedModules.has(path[1]) || path[1].endsWith('.d.ts')) {
      continue;
    }
    const identifier = `${path[0]}.${path[1].replace(/\.tsx?$/, '')}`;
    modules.add(identifier);
    if (!statuses.has(identifier)) {
      problems.push(`R2.1: ${relative(root, file)} is the module of no card.`);
    } else if (!readFileSync(file, 'utf8').includes(`Feature: ${identifier}`)) {
      problems.push(`R2.1: ${relative(root, file)} does not say "Feature: ${identifier}" in a doc comment.`);
    }
  }
  for (const [identifier, status] of statuses) {
    if ((status === 'Built' || status === 'Seen') && !modules.has(identifier) && !identifier.startsWith('runner.')) {
      problems.push(`R2.1: ${identifier} is built but src/features/${identifier.replace('.', '/')}.ts is missing.`);
    }
  }
  return problems;
}

/** R8.2: a TODO in the sources that names no open question. */
export function checkTodos(root) {
  const problems = [];
  for (const file of files(join(root, 'src'), ['.ts', '.tsx', '.css'])) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, number) => {
        if (/\bTODO\b/.test(line) && !/\bTODO\b.*\bQ\d+\b/.test(line)) {
          problems.push(`R8.2: ${relative(root, file)}:${number + 1}: a TODO names an open question (Qn).`);
        }
      });
  }
  return problems;
}

/** Every problem of the project's own checks, for the repository in `root`. */
export function ownProblems(root) {
  return [...checkDependencies(root), ...checkFeatureModules(root), ...checkTodos(root)];
}
