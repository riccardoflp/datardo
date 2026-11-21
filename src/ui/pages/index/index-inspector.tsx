/**
 * The index selected in the Indexes section, in the inspector island (`index.inspect`, `@inspector`): its name and
 * badges, its actions, **Definition** as a tree, **Command** with **Copy**, and **Usage by member**; for a search
 * index its type and status, **Message** and **Status by host**.
 */
import { view, type InspectAction, type InspectedIndex, type InspectView } from '../../../features/index/inspect';
import { text } from '../../../features/index/text';
import type { JsonDocument } from '../../../features/index/types';
import { savedConnection } from '../../../shared/state/connections';
import type { Json } from '../../../shared/engine-request';
import type { TabId } from '../../../shared/ids';
import { mongoshValue } from '../../../shared/mongosh-value';
import { useAppState } from '../../state/store';
import type { IndexPlace } from './index-actions';
import { useIndexMemory, type IndexMemory } from './index-store';
import { startRowAction } from './row-actions';
import styles from './index.module.css';

/** The index or search index the section has selected, as last read; `undefined` when none, or gone. */
export function inspectedOf(memory: IndexMemory): InspectedIndex | undefined {
  const selected = memory.selected;
  if (selected === undefined) {
    return undefined;
  }
  if (selected.kind === 'index') {
    const list = memory.indexes?.kind === 'list' ? memory.indexes.list.indexes : [];
    const index = list.find((each) => each.name === selected.name);
    return index === undefined ? undefined : { kind: 'index', index };
  }
  const list = memory.searchIndexes?.kind === 'indexes' ? memory.searchIndexes.indexes : [];
  const index = list.find((each) => each.name === selected.name);
  return index === undefined ? undefined : { kind: 'search', index };
}

function isObject(value: Json): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function TreeLines({ value }: { readonly value: JsonDocument | readonly Json[] }): React.JSX.Element {
  const entries: readonly (readonly [string, Json])[] = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  return (
    <ul className={styles['tree']}>
      {entries.map(([key, item]) => (
        <li key={key}>
          <span className={styles['muted']}>{key}: </span>
          {isObject(item) || Array.isArray(item) ? (
            <TreeLines value={item} />
          ) : (
            <span className={styles['code']}>{mongoshValue(item)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Actions(props: {
  readonly place: IndexPlace;
  readonly actions: readonly InspectAction[];
  readonly inspected: InspectedIndex;
}): React.JSX.Element | null {
  if (props.actions.length === 0) {
    return null;
  }
  return (
    <div className={styles['field-row']}>
      {props.actions.map((action) => (
        <button
          key={action.element}
          type="button"
          className={styles['button']}
          data-feature={action.element}
          title={action.tooltip}
          onClick={() => {
            startRowAction(props.place, action.element, props.inspected);
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function CommandPart({ command }: { readonly command: string }): React.JSX.Element {
  return (
    <section className={styles['option']}>
      <div className={styles['field-row']}>
        <h3 className={styles['heading']}>{text.inspect.command}</h3>
        <button
          type="button"
          className={styles['button']}
          title={text.inspect.copyHint}
          onClick={() => {
            void navigator.clipboard.writeText(command);
          }}
        >
          {text.inspect.copy}
        </button>
      </div>
      <pre className={styles['command']}>{command}</pre>
    </section>
  );
}

function LinesPart({ heading, lines }: { readonly heading: string; readonly lines: readonly string[] }) {
  return lines.length === 0 ? null : (
    <section className={styles['option']}>
      <h3 className={styles['heading']}>{heading}</h3>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </section>
  );
}

function Shown(props: {
  readonly place: IndexPlace;
  readonly shown: Exclude<InspectView, { kind: 'empty' }>;
  readonly inspected: InspectedIndex;
}): React.JSX.Element {
  const { shown } = props;
  return (
    <>
      <h2 className={styles['heading']}>{shown.name}</h2>
      {shown.kind === 'index' ? (
        <span className={styles['badges']}>
          {shown.badges.map((badge) => (
            <span key={badge.label} className={styles['badge']} data-warning={badge.warning} title={badge.tooltip}>
              {badge.label}
            </span>
          ))}
        </span>
      ) : (
        <span className={styles['muted']}>{[shown.type, shown.status].filter(Boolean).join(' · ')}</span>
      )}
      <Actions place={props.place} actions={shown.actions} inspected={props.inspected} />
      <section className={styles['option']}>
        <h3 className={styles['heading']}>{text.inspect.definition}</h3>
        <TreeLines value={shown.definition} />
      </section>
      <CommandPart command={shown.command} />
      {shown.kind === 'index' ? (
        <LinesPart heading={text.inspect.usageByMember} lines={shown.members} />
      ) : (
        <>
          <LinesPart heading={text.inspect.message} lines={shown.message === undefined ? [] : [shown.message]} />
          <LinesPart heading={text.inspect.statusByHost} lines={shown.hosts} />
        </>
      )}
    </>
  );
}

/** The index selected in the Indexes section of a tab. */
export function IndexInspector({ tab }: { readonly tab: TabId }): React.JSX.Element | null {
  const state = useAppState();
  const memory = useIndexMemory(tab);
  const open = state.tabs.tabs.find((each) => each.id === tab);
  const shows = open?.shows;
  if (shows?.kind !== 'collection') {
    return null;
  }
  const readOnly = savedConnection(state.connections, shows.connection)?.readOnly ?? false;
  const inspected = inspectedOf(memory);
  const shown = view({
    collection: shows.collection,
    readOnly,
    ...(inspected === undefined ? {} : { selected: inspected }),
  });
  const place: IndexPlace = {
    tab,
    connection: shows.connection,
    database: shows.database,
    collection: shows.collection,
  };
  return (
    <div className={styles['inspector']} data-feature="index.inspect@inspector">
      {shown.kind === 'empty' || inspected === undefined ? (
        <p className={styles['muted']}>{shown.kind === 'empty' ? shown.text : text.inspect.empty}</p>
      ) : (
        <Shown place={place} shown={shown} inspected={inspected} />
      )}
    </div>
  );
}
