/**
 * `watch.event-detail`: the change event selected on a Watch changes page, in the inspector island: its type, its
 * collection, its `_id` and its time; **Open document** and **Copy event**; then its sections (what changed, the
 * document after or before, the change event as the server sent it). Also what the page adds to its tab for the island
 * (`nav.inspector`): whether a change event is selected, and its type and `_id` as the island's title.
 */
import { view as detailView, type EventControl, type SectionContent } from '../../../features/watch/event-detail';
import type { Inspection } from '../../../features/nav/types';
import type { Json } from '../../../shared/engine-request';
import { connectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import type { WatchPage } from '../../../shared/state/watch';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { documentShows } from '../document/document-actions';
import { offsetMinutes, shownPage } from './watch-page';
import { startOnPage, useWatchTab, watchTabOf } from './watch-store';
import styles from './watch-page.module.css';

function detailOf(page: WatchPage, selected: number | undefined) {
  const shown = shownPage(page, { ...(selected === undefined ? {} : { selected }) });
  const event = shown.events.find((each) => each.number === shown.selected);
  return detailView({ ...(event === undefined ? {} : { event }), offsetMinutes: offsetMinutes() });
}

function startButton(tab: string, page: WatchPage, button: EventControl): void {
  if (button.feature === 'document.open') {
    const args = button.args as { readonly database?: string; readonly collection?: string; readonly id?: Json };
    const where = {
      connection: connectionId(page.watched.connection),
      database: args.database ?? '',
      collection: args.collection ?? '',
    };
    startFeature('tab.open', { place: 'inspector', args: { shows: documentShows(where, args.id ?? null) } });
    return;
  }
  void startOnPage(tab, button.feature, 'inspector', button.args);
}

function Content({ content }: { readonly content: SectionContent }): React.JSX.Element {
  if (content.kind === 'note') {
    return <p className={styles['note']}>{content.text}</p>;
  }
  if (content.kind === 'document') {
    return <pre className={styles['document']}>{content.text}</pre>;
  }
  return (
    <table className={styles['changesTable']}>
      <thead>
        <tr>
          {content.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {content.lines.map((line) => (
          <tr key={line.field} data-kind={line.kind}>
            <th scope="row">{line.field}</th>
            {line.cells.map((cell, index) => (
              <td key={index} className={cell.kind === 'value' ? undefined : styles['muted']}>
                {cell.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The change event selected, as the inspector island draws it. */
export function WatchInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const local = useWatchTab(tabId);
  const page = app.watch[tabId];
  if (page === undefined) {
    return null;
  }
  const detail = detailOf(page, local.selected);
  if (detail.kind === 'nothing-selected') {
    return <p className={styles['note']}>{detail.text}</p>;
  }
  return (
    <div className={styles['detail']}>
      <h2 className={styles['detailHeading']}>
        {detail.type} · {detail.namespace}
      </h2>
      <dl className={styles['facts']}>
        <dt>_id</dt>
        <dd className={styles['code']}>{detail.id}</dd>
        <dt>time</dt>
        <dd>{detail.time}</dd>
      </dl>
      <div className={styles['buttons']}>
        {detail.buttons.map((button) => (
          <button
            key={button.element}
            type="button"
            className={styles['button']}
            data-feature={button.element}
            title={button.tooltip}
            onClick={() => {
              startButton(tabId, page, button);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
      {detail.sections.map((section) => (
        <details key={section.title} open={!section.folded}>
          <summary className={styles['summary']}>{section.title}</summary>
          <Content content={section.content} />
        </details>
      ))}
    </div>
  );
}

/** What a Watch changes tab adds to the active tab for the inspector island: the change event selected. */
export function watchExtras(app: AppState, tabId: string): { inspection?: Inspection } {
  const page = app.watch[tabId];
  if (page === undefined || activeTabOf(app.tabs)?.id !== tabId) {
    return {};
  }
  const detail = detailOf(page, watchTabOf(tabId).selected);
  if (detail.kind === 'event') {
    return { inspection: { selected: 1, title: `${detail.type} · ${detail.id}`, emptyLine: '' } };
  }
  return { inspection: { selected: 0, emptyLine: detail.text } };
}
