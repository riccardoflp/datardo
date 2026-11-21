/**
 * The pieces of the Index advisor page: a button of an advice (`AdvisorControl`), the notes under the sources, and
 * the items of its three lists: an index to create with its queries, and a redundant, unused or hidden index.
 */
import type { AdviceList } from '../../../features/advisor/show';
import type { CreateItem, IndexItem } from '../../../features/advisor/parts/advice-items';
import type { SourcesView } from '../../../features/advisor/parts/sources';
import type { AdvisorControl } from '../../../features/advisor/parts/words';
import { act } from './advisor-reads';
import styles from './advisor-page.module.css';

/** A button of the page; a disabled one says why in its tooltip. */
export function AdvisorButton(props: { readonly tab: string; readonly control: AdvisorControl }): React.JSX.Element {
  const { control } = props;
  const disabled = control.kind === 'start' && !control.enabled;
  const tooltip = control.kind === 'toggle' ? undefined : control.tooltip;
  return (
    <button
      type="button"
      className={styles['button']}
      {...(control.kind === 'start' && control.element !== undefined ? { 'data-feature': control.element } : {})}
      aria-disabled={disabled ? true : undefined}
      title={tooltip}
      onClick={() => {
        void act(props.tab, control, 'toolbar');
      }}
    >
      {control.label}
    </button>
  );
}

/** Where the slow operations come from, with the lines under it and their buttons. */
export function Sources(props: { readonly tab: string; readonly sources: SourcesView }): React.JSX.Element {
  return (
    <div className={styles['sources']}>
      <p>{props.sources.line}</p>
      {props.sources.notes.map((note) => (
        <p key={note.text} className={`${styles['note'] ?? ''} ${styles['line'] ?? ''}`}>
          {note.text}
          {note.buttons.map((button) => (
            <AdvisorButton key={button.label} tab={props.tab} control={button} />
          ))}
        </p>
      ))}
    </div>
  );
}

function CreateEntry(props: { readonly tab: string; readonly item: CreateItem }): React.JSX.Element {
  const { tab, item } = props;
  return (
    <li className={styles['item']}>
      <p className={styles['heading']}>
        <span>{item.collection}</span> <code>{item.keys}</code>
      </p>
      <p>{item.why}</p>
      <ul className={styles['queries']}>
        {item.queries.map((query) => (
          <li key={`${query.kind} ${query.shape}`} className={styles['line']}>
            <code>
              {query.kind} {query.shape}
            </code>{' '}
            <span className={styles['note']}>{query.details}</span>
            <AdvisorButton tab={tab} control={query.open} />
            <AdvisorButton tab={tab} control={query.explain} />
          </li>
        ))}
      </ul>
      <div className={styles['buttons']}>
        {item.more === undefined ? null : <AdvisorButton tab={tab} control={item.more} />}
        <AdvisorButton tab={tab} control={item.create} />
        <AdvisorButton tab={tab} control={item.copy} />
      </div>
    </li>
  );
}

function IndexEntry(props: { readonly tab: string; readonly item: IndexItem }): React.JSX.Element {
  const { tab, item } = props;
  return (
    <li className={styles['item']}>
      <p className={styles['heading']}>
        <span>{item.collection}</span> <code>{item.index}</code>
        {item.marks === '' ? null : <span className={styles['note']}> {item.marks}</span>}
        {item.size === undefined ? null : <span className={styles['note']}> · {item.size}</span>}
      </p>
      {item.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <div className={styles['buttons']}>
        {item.buttons.map((button) => (
          <AdvisorButton key={button.label} tab={tab} control={button} />
        ))}
      </div>
    </li>
  );
}

/** One of the three lists, with the number of its advices, its note and what it says when it is empty. */
export function AdviceSection<T extends CreateItem | IndexItem>(props: {
  readonly tab: string;
  readonly list: AdviceList<T>;
  readonly note?: string;
}): React.JSX.Element {
  const { tab, list } = props;
  return (
    <section className={styles['list']} aria-label={list.heading}>
      <h2 className={styles['list-heading']}>
        {list.heading} <span className={styles['count']}>{list.count}</span>
      </h2>
      {props.note === undefined ? null : <p className={styles['note']}>{props.note}</p>}
      {list.empty === undefined ? null : <p className={styles['empty']}>{list.empty}</p>}
      <ul className={styles['items']}>
        {list.items.map((item) =>
          'why' in item ? (
            <CreateEntry key={item.id} tab={tab} item={item} />
          ) : (
            <IndexEntry key={item.id} tab={tab} item={item} />
          ),
        )}
      </ul>
    </section>
  );
}
