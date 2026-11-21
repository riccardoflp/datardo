/**
 * **Code** and **Copy code** from Go to and their keys (`palette.run-command`): the Code section of the active
 * collection tab on the query of its bar (`codegen.show`), and the code it shows to the clipboard (`codegen.copy`),
 * which Go to offers only while the section shows code.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf } from '../../query/collection-reads';
import { codeShown, copyCode, showCode } from './code-actions';

/** Whether a command is carried out here. */
export function isCodeCommand(id: string): boolean {
  return id === 'codegen.show' || id === 'codegen.copy';
}

/** Whether Go to offers a command of the Code section, as only the window knows: **Copy code** while code is shown. */
export function isCodeOfferedNow(id: string, state: AppState): boolean {
  if (id !== 'codegen.copy') {
    return true;
  }
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  return ref !== undefined && active?.section === 'code' && codeShown(ref) !== undefined;
}

/** Runs **Code** or **Copy code** on the active collection tab. */
export function runCodeCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  if (id === 'codegen.show') {
    showCode(ref);
  } else if (isCodeOfferedNow(id, state)) {
    void copyCode(ref);
  }
}
