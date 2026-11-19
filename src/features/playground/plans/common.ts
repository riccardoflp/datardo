/**
 * What the Operations of the playground area build their plans from: an app step, a plan that changes nothing on a
 * deployment, and the MongoDB connections a playground can run on.
 */
import type { ConnectionView } from '../../../shared/connection';
import type { Json } from '../../../shared/engine-request';
import type { After, AppStep, Outcome, Step } from '../../../shared/feature';
import { noDanger, run } from '../../../shared/feature';
import type { AppState } from '../../../shared/state';

/** An app step: a change to Datardo's own data that the main process carries out under `action`. */
export function appStep(words: string, action: string, args: Json): AppStep {
  return { kind: 'app', text: words, action, args };
}

/** A plan that writes nothing to a deployment and cannot be undone, for the reason given. */
export function appPlan(
  title: string,
  steps: readonly Step[],
  cannotUndo: string,
  after: readonly After[] = [],
): Outcome {
  return run({ title, steps, danger: noDanger, undo: { cannot: cannotUndo }, publishes: false, after });
}

/** The saved MongoDB connections, as Datardo lists them: those in no folder first, then by folder. */
export function mongoConnections(state: AppState): readonly ConnectionView[] {
  const mongo = state.connections.saved.filter((each) => each.engine === 'mongodb');
  const loose = mongo.filter((each) => each.folder === undefined);
  const folders = [...new Set(mongo.flatMap((each) => each.folder ?? []))].sort((one, other) =>
    one.localeCompare(other),
  );
  return [...loose, ...folders.flatMap((folder) => mongo.filter((each) => each.folder === folder))];
}

/** A saved MongoDB connection by its identifier, when there is one. */
export function mongoConnection(state: AppState, id: string | undefined): ConnectionView | undefined {
  return id === undefined ? undefined : mongoConnections(state).find((each) => each.id === id);
}

/** A value of the arguments of a plan, as JSON. */
export function json(value: object): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
