/**
 * What the Scheduled tasks page keeps in the window alone (`task.show`, `task.edit`): the items whose details are open,
 * which stay open for the session, the item selected, and the form of a task while one is created or edited, opened
 * once for each request `task.edit` keeps (`state.runner.remembered['task.edit']`). The form is sent with
 * `task.edit` when its button is pressed; **Browse…** asks the system for the folder (`task.edit:folder`).
 */
import { useSyncExternalStore } from 'react';
import { formProblems, newTaskForm, withKind, type FormField, type TaskForm } from '../../../features/task/edit';
import { formRequestKey, formRequestOf, taskForm } from '../../../features/task/editing/form-request';
import { formText } from '../../../features/task/text';
import { dialogArgs } from '../../../features/transfer/ask/choose-path';
import type { ConnectionView } from '../../../shared/connection';
import type { Json } from '../../../shared/engine-request';
import { featureId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import type { TaskId, TaskKind } from '../../../shared/state/tasks';
import { appTarget } from '../../../shared/target';

/** The form while it is open. */
export interface OpenForm {
  readonly form: TaskForm;
  /** The task edited, and its name; none for a new task. */
  readonly editing?: { readonly id: TaskId; readonly name: string };
  readonly touched: readonly FormField[] | 'all';
  /** Why the last **Create task** or **Save** did not save. */
  readonly failure?: string;
}

/** The fields of the page that only the window sets. */
export interface TasksPageFields {
  readonly open: readonly TaskId[];
  readonly selected?: TaskId;
  readonly form?: OpenForm;
  /** The last request of `task.edit` the page opened the form for. */
  readonly handled: number;
}

let fields: TasksPageFields = { open: [], handled: 0 };
const listeners = new Set<() => void>();

function changed(next: TasksPageFields): void {
  fields = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The fields of the page, drawn again whenever they change. */
export function useTasksPage(): TasksPageFields {
  return useSyncExternalStore(subscribe, () => fields);
}

/** A click on an item, or `Enter` on it: its details open, or close. */
export function toggleDetails(id: TaskId): void {
  const open = fields.open.includes(id) ? fields.open.filter((each) => each !== id) : [...fields.open, id];
  changed({ ...fields, open, selected: id });
}

/** The item selected, which `Delete` deletes. */
export function select(id: TaskId): void {
  if (fields.selected !== id) {
    changed({ ...fields, selected: id });
  }
}

/** Opens the form for a request of `task.edit` that the page has not opened yet. */
export function followFormRequest(state: AppState): void {
  const request = formRequestOf(state.runner.remembered[formRequestKey]);
  if (request === undefined || request.asked <= fields.handled) {
    return;
  }
  const task = request.task === undefined ? undefined : state.tasks.tasks.find((each) => each.id === request.task);
  const form =
    task === undefined ? newTaskForm(request.source, state.connections.saved, request.folder) : taskForm(task);
  changed({
    ...fields,
    handled: request.asked,
    form: { form, touched: [], ...(task === undefined ? {} : { editing: { id: task.id, name: task.name } }) },
  });
}

/** Changes fields of the form. */
export function changeForm(change: Partial<TaskForm>): void {
  if (fields.form !== undefined) {
    changed({ ...fields, form: { ...fields.form, form: { ...fields.form.form, ...change } } });
  }
}

/** Switches the kind: a name still at its default follows, the format becomes the kind's default. */
export function changeKind(kind: TaskKind, connections: readonly ConnectionView[]): void {
  if (fields.form !== undefined) {
    changed({ ...fields, form: { ...fields.form, form: withKind(fields.form.form, kind, connections) } });
  }
}

/** A field lost the focus: what is wrong with it is shown. */
export function touch(field: FormField): void {
  const form = fields.form;
  if (form === undefined || form.touched === 'all' || form.touched.includes(field)) {
    return;
  }
  changed({ ...fields, form: { ...form, touched: [...form.touched, field] } });
}

/** **Cancel**: the form closes and nothing is saved. */
export function closeForm(): void {
  const { form: _closed, ...rest } = fields;
  changed(rest);
}

/** **Browse…**: the system's folder dialog; the folder chosen goes in the form. */
export async function browseFolder(): Promise<void> {
  const result = await window.datardo.start({
    feature: featureId('task.edit:folder'),
    target: appTarget,
    place: 'form',
    args: dialogArgs({ mode: 'folder', title: formText.folderDialogTitle, button: formText.folderDialogButton }),
  });
  if (result.kind === 'read' && typeof result.result === 'string') {
    changeForm({ folder: result.result });
  }
}

/** **Create task** or **Save**: every problem shown; a form without any is sent with `task.edit`. */
export async function submitForm(): Promise<void> {
  const open = fields.form;
  if (open === undefined) {
    return;
  }
  changed({
    ...fields,
    form: { form: open.form, touched: 'all', ...(open.editing === undefined ? {} : { editing: open.editing }) },
  });
  if (Object.keys(formProblems(open.form)).length > 0) {
    return;
  }
  const result = await window.datardo.start({
    feature: featureId('task.edit'),
    target: appTarget,
    place: 'form',
    args: { form: open.form as unknown as Json, ...(open.editing === undefined ? {} : { task: open.editing.id }) },
  });
  if (fields.form?.form !== open.form) {
    return;
  }
  if (result.kind === 'done') {
    closeForm();
  } else if (result.kind === 'refused' || result.kind === 'failed') {
    changed({ ...fields, form: { ...fields.form, failure: result.message } });
  }
}
