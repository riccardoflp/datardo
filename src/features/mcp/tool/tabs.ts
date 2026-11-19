/**
 * What the tools that open tabs give the main process (`mcp.tab-tools`): the intent of `tab.open`, with what the tab
 * shows, its section and what it is filled with (the query bar's texts, the pipeline's stages, the pattern of the keys),
 * and the sentence the AI gets once it opened.
 */
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import { appTarget } from '../../../shared/target';
import type { TabMemory, TabShows } from '../../../shared/state/tabs';
import { editorJson, type Stage } from '../../aggregate/types';
import { keptText, restoredQuery } from '../../query/restore';
import { mcpActions } from '../types';
import { recordOf } from './mongo';
import type { ToolSession } from './program';

/** What a tab is opened with. */
export interface TabOpening {
  readonly shows: TabShows;
  readonly section?: string;
  readonly memory?: TabMemory;
  /** What the page itself does once open, for the pages that start from what they are given (a search). */
  readonly start?: Json;
}

/** The memory of a collection tab whose query bar holds the texts given, run at once as a restored tab's is. */
export function queryMemory(texts: {
  readonly filter: string;
  readonly sort: string;
  readonly projection: string;
}): TabMemory {
  const kept = restoredQuery({
    mode: 'find',
    texts: { filter: texts.filter, sort: texts.sort, project: texts.projection },
  });
  return { query: keptText(kept) };
}

/** The memory of a collection tab in Aggregate mode with these stages. */
export function pipelineMemory(stages: readonly Stage[]): TabMemory {
  const kept = restoredQuery({ mode: 'aggregate' });
  return { query: keptText(kept), pipeline: JSON.stringify(editorJson({ stages })) };
}

/** A collection tab. */
export function collectionShows(
  connection: ConnectionId,
  where: { readonly database: string; readonly collection: string; readonly view: boolean },
): TabShows {
  return {
    kind: 'collection',
    connection,
    database: where.database,
    collection: where.collection,
    ...(where.view ? { view: true } : {}),
  };
}

/** The sentence that ends an answer when Datardo's window is hidden in the tray. */
export const hiddenInTray = "Datardo's window is hidden in the tray: the user sees the tab when they open it.";

/** Opens the tab through the main process, and the sentence the AI gets, with the tray's when the window is hidden. */
export function openTab(session: ToolSession, opening: TabOpening, sentence: string): string {
  const intent: Json = {
    feature: 'tab.open',
    target: { kind: appTarget.kind },
    args: {
      shows: opening.shows as unknown as Json,
      background: false,
      ...(opening.section === undefined ? {} : { section: opening.section }),
      ...(opening.memory === undefined ? {} : { memory: opening.memory as Json }),
      ...(opening.start === undefined ? {} : { start: opening.start }),
    },
  };
  const reply = recordOf(session.app(mcpActions.openTab, { intent }));
  return reply['hidden'] === true ? `${sentence} ${hiddenInTray}` : sentence;
}
