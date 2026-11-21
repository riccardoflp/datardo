/**
 * What the Code section does (`codegen.show`): it takes the query of the tab (`codegen.source`) when shown and each
 * time **Code** is pressed, in the window, since nothing is sent to a server; a language chosen or **Full program**
 * changed starts `codegen.show` with `{ choices }`, so that the tab keeps them; **Copy** starts `codegen.copy` with the
 * code shown, after which the status line says *Copied to the clipboard*.
 */
import { makersOf } from '../../../features/aggregate/types';
import { editorJson } from '../../../features/aggregate/types';
import { codeChoices, codeOfTab, shownCode, type CodeAsk } from '../../../features/codegen/show';
import type { CodeLanguage } from '../../../features/codegen/types';
import type { Context } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import type { CollectionRef } from '../../query/collection-reads';
import { collectionOf } from '../../query/collection-store';
import { startFeature } from '../../shell/intent';
import { flashCopied } from '../../table/copied-flash';
import { pipelineOf } from '../aggregate/pipeline-store';
import { askCode, changeCodeMemory, codeMemoryOf } from './code-store';

function targetOf(ref: CollectionRef) {
  return {
    kind: 'collection' as const,
    connection: ref.connection,
    database: ref.database,
    collection: ref.collection,
  };
}

/** Takes the query the code is asked of, as the tab holds it now. */
export function takeSource(ref: CollectionRef): void {
  const memory = codeMemoryOf(ref.tab);
  const { query } = collectionOf(ref.tab);
  const tab = {
    database: ref.database,
    collection: ref.collection,
    mode: query.mode,
    texts: query.texts,
    pipeline: editorJson(pipelineOf(ref.tab).draft),
  };
  const source = codeOfTab(memory.ask, tab, makersOf({ now: Date.now() } as Context));
  changeCodeMemory(ref.tab, (before) => ({ ...before, source, taken: memory.asked }));
}

/** **Code** from the section bar, the query bar, the pipeline editor or Go to: the code of the query of the tab. */
export function showCode(ref: CollectionRef, ask: CodeAsk = { kind: 'query' }, place?: 'section-bar' | 'query-bar') {
  askCode(ref.tab, ask);
  startFeature('codegen.show', { ...(place === undefined ? {} : { place }), target: targetOf(ref) });
}

function keepChoices(ref: CollectionRef): void {
  const { language, program } = codeMemoryOf(ref.tab);
  startFeature('codegen.show', { target: targetOf(ref), args: { choices: codeChoices({ language, program }) } });
}

/** A language chosen: the code is written again at once, and the tab keeps the choice. */
export function chooseLanguage(ref: CollectionRef, language: CodeLanguage): void {
  changeCodeMemory(ref.tab, (memory) => ({ ...memory, language }));
  keepChoices(ref);
}

/** **Full program** changed: the code is written again at once, and the tab keeps the choice. */
export function toggleProgram(ref: CollectionRef): void {
  changeCodeMemory(ref.tab, (memory) => ({ ...memory, program: !memory.program }));
  keepChoices(ref);
}

/** The code the section of a tab shows now, when it shows code. */
export function codeShown(ref: CollectionRef): string | undefined {
  const { source, language, program } = codeMemoryOf(ref.tab);
  return source === undefined ? undefined : shownCode({ source, collection: ref.collection, language, program });
}

/** **Copy**: the code shown, to the clipboard; the status line then says *Copied to the clipboard*. */
export async function copyCode(ref: CollectionRef, place?: 'toolbar'): Promise<void> {
  const code = codeShown(ref);
  if (code === undefined) {
    return;
  }
  const { language } = codeMemoryOf(ref.tab);
  const result = await window.datardo.start({
    feature: featureId('codegen.copy'),
    target: targetOf(ref),
    ...(place === undefined ? {} : { place }),
    args: { code, language, collection: ref.collection },
  });
  if (result.kind === 'done') {
    flashCopied();
  }
}
