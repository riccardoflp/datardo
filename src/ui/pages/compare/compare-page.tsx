/**
 * `compare.show`: the comparison page of the active tab. From the top: the sides (**Left**, **⇄**, the three lists of
 * **Right**), the options and **Compare** (**Cancel** while a comparison runs), the progress, the message and the
 * error lines, the counts, the bulk writes, then the list of the differences with the buttons of each row; selecting
 * a row, with a click or the arrow keys, shows its difference in the inspector island, and `Enter` moves the focus
 * there. The page reads and writes through `./compare-runs.ts` and `./compare-writes.ts`.
 */
import { useEffect } from 'react';
import { view, type ComparePageView, type SideView } from '../../../features/compare/show';
import { text } from '../../../features/compare/text';
import { connectionId } from '../../../shared/ids';
import { activeTabOf, type Tab } from '../../../shared/state/tabs';
import { useAppState } from '../../state/store';
import { CompareList } from './compare-list';
import {
  cancelComparison,
  changeOptions,
  chooseCollection,
  chooseConnection,
  chooseDatabase,
  compare,
  openComparison,
  swapSides,
} from './compare-runs';
import { pressChip, useCompareTab, type CompareTab } from './compare-store';
import { workDetail } from './compare-work';
import { makeLike } from './compare-writes';
import styles from './compare-page.module.css';

function Side({ side }: { readonly side: SideView }): React.JSX.Element {
  return (
    <span className={styles['side']}>
      <code className={styles['namespace']}>{side.namespace}</code>
      <span className={styles['muted']}>{side.connectionName}</span>
      {side.badge === undefined ? null : (
        <span className={styles['badge']} title={side.badge.hint}>
          {side.badge.text}
        </span>
      )}
    </span>
  );
}

function List(props: {
  readonly id: string;
  readonly list: { readonly label: string; readonly chosen?: string };
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  readonly onChoose: (value: string) => void;
}): React.JSX.Element {
  const { id, list, choices, onChoose } = props;
  return (
    <label className={styles['field']} htmlFor={id}>
      <span>{list.label}</span>
      <select
        id={id}
        className={styles['select']}
        aria-label={list.label}
        value={list.chosen ?? ''}
        onChange={(event) => {
          if (event.target.value !== '') {
            onChoose(event.target.value);
          }
        }}
      >
        {list.chosen === undefined ? <option value="">—</option> : null}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Sides({ tab, shown }: { readonly tab: string; readonly shown: ComparePageView }): React.JSX.Element {
  const { right } = shown;
  return (
    <div className={styles['sides']} role="group" aria-label={text.commands.show}>
      <span className={styles['label']}>{shown.left.label}</span>
      <Side side={shown.left} />
      <button
        type="button"
        className={styles['button']}
        title={shown.swap.hint}
        aria-label={shown.swap.hint}
        aria-disabled={shown.swap.enabled ? undefined : true}
        onClick={() => {
          if (shown.swap.enabled) swapSides(tab);
        }}
      >
        {shown.swap.label}
      </button>
      <span className={styles['label']}>{text.sides.right}</span>
      <List
        id={`${tab}-connection`}
        list={right.connection}
        choices={right.connection.choices.map((each) => ({
          value: each.connection,
          label: [each.name, ...each.notes].join(' · '),
        }))}
        onChoose={(value) => void chooseConnection(tab, connectionId(value), { then: 'first-time' })}
      />
      {right.database === undefined ? null : (
        <List
          id={`${tab}-database`}
          list={right.database}
          choices={right.database.choices.map((name) => ({ value: name, label: name }))}
          onChoose={(value) => void chooseDatabase(tab, value, { then: 'first-time' })}
        />
      )}
      {right.collection === undefined ? null : (
        <List
          id={`${tab}-collection`}
          list={right.collection}
          choices={right.collection.choices.map((each) => ({
            value: each.name,
            label: each.view ? `${each.name} · ${text.sides.view}` : each.name,
          }))}
          onChoose={(value) => {
            chooseCollection(tab, value);
          }}
        />
      )}
      {right.side?.badge === undefined ? null : (
        <span className={styles['badge']} title={right.side.badge.hint}>
          {right.side.badge.text}
        </span>
      )}
      {right.empty === undefined ? null : <p className={styles['message']}>{right.empty}</p>}
    </div>
  );
}

function Options({ tab, shown }: { readonly tab: string; readonly shown: ComparePageView }): React.JSX.Element {
  const { options, compare: button } = shown;
  const disabled = !options.enabled;
  const onEnter = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && options.enabled) {
      event.preventDefault();
      void compare(tab);
    }
  };
  return (
    <div className={styles['options']} role="group" aria-label={text.options.compare}>
      <label className={styles['grow']}>
        <span>{options.filter.label}</span>
        <input
          className={styles['input']}
          value={options.filter.value}
          placeholder={options.filter.placeholder}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => {
            changeOptions(tab, { filter: event.target.value }, false);
          }}
          onKeyDown={onEnter}
        />
      </label>
      <label className={styles['field']} title={options.ignore.hint}>
        <span>{options.ignore.label}</span>
        <input
          className={styles['input']}
          value={options.ignore.value}
          placeholder={options.ignore.placeholder}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => {
            changeOptions(tab, { ignore: event.target.value }, false);
          }}
          onKeyDown={onEnter}
        />
      </label>
      <label className={styles['check']} title={options.ignoreOrder.hint}>
        <input
          type="checkbox"
          checked={options.ignoreOrder.checked}
          disabled={disabled}
          onChange={(event) => {
            changeOptions(tab, { ignoreOrder: event.target.checked }, true);
          }}
        />
        {options.ignoreOrder.label}
      </label>
      <label className={styles['check']} title={options.numbersByValue.hint}>
        <input
          type="checkbox"
          checked={options.numbersByValue.checked}
          disabled={disabled}
          onChange={(event) => {
            changeOptions(tab, { numbersByValue: event.target.checked }, true);
          }}
        />
        {options.numbersByValue.label}
      </label>
      <button
        type="button"
        className={styles['primary']}
        title={button.hint}
        aria-disabled={button.enabled ? undefined : true}
        onClick={() => {
          if (!button.enabled) return;
          if (shown.progress === undefined) void compare(tab);
          else cancelComparison(tab);
        }}
      >
        {button.label}
      </button>
    </div>
  );
}

function Counts({ tab, shown }: { readonly tab: string; readonly shown: ComparePageView }): React.JSX.Element | null {
  if (shown.counts === undefined) {
    return null;
  }
  return (
    <div className={styles['counts']}>
      {shown.counts.chips.map((chip) =>
        chip.kind === 'identical' ? (
          <span key={chip.kind} className={styles['chip']}>
            {chip.label}
          </span>
        ) : (
          <button
            key={chip.kind}
            type="button"
            className={styles['chip']}
            data-kind={chip.kind}
            aria-pressed={chip.pressed}
            aria-disabled={chip.enabled ? undefined : true}
            onClick={() => {
              if (chip.enabled && chip.kind !== 'identical') pressChip(tab, chip.kind);
            }}
          >
            {chip.label}
          </button>
        ),
      )}
      <span className={styles['muted']}>{shown.counts.summary}</span>
    </div>
  );
}

function Bulk({ tab, shown }: { readonly tab: string; readonly shown: ComparePageView }): React.JSX.Element | null {
  if (shown.bulk.length === 0 && shown.shown === undefined) {
    return null;
  }
  return (
    <div className={styles['bulk']} role="toolbar" aria-label={text.bulk.rightLikeLeft}>
      {shown.bulk.map((button) => (
        <button
          key={button.to}
          type="button"
          className={styles['button']}
          data-feature={button.element}
          title={button.hint}
          aria-disabled={button.enabled ? undefined : true}
          onClick={() => {
            if (button.enabled) void makeLike(tab, button.to);
          }}
        >
          {button.label}
        </button>
      ))}
      {shown.shown === undefined ? null : <span className={styles['muted']}>{shown.shown}</span>}
    </div>
  );
}

function Lines({ shown }: { readonly shown: ComparePageView }): React.JSX.Element {
  return (
    <>
      {shown.progress === undefined ? null : (
        <p className={styles['line']} role="status">
          {shown.progress}
        </p>
      )}
      {shown.message === undefined ? null : (
        <p className={styles['line']} role="status">
          {shown.message}
        </p>
      )}
      {shown.error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {shown.error}
        </p>
      )}
    </>
  );
}

function TabPage({ tab, shows }: { readonly tab: string; readonly shows: Tab }): React.JSX.Element | null {
  useAppState();
  useEffect(() => {
    openComparison(tab, shows.shows, shows.memory?.choices);
    // The page opens once for its tab: what the tab keeps is read only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const page: CompareTab | undefined = useCompareTab(tab);
  if (page === undefined) {
    return null;
  }
  const detail = page.page.progress === undefined ? undefined : workDetail(tab);
  const shown = view(detail === undefined ? page.page : { ...page.page, progress: detail });
  const error = shown.error ?? page.page.choosing.error;
  return (
    <div className={styles['page']}>
      <Sides tab={tab} shown={shown} />
      <Options tab={tab} shown={shown} />
      <Lines shown={error === undefined ? shown : { ...shown, error }} />
      <Counts tab={tab} shown={shown} />
      <Bulk tab={tab} shown={shown} />
      <CompareList tab={tab} shown={shown} />
    </div>
  );
}

/** The comparison page of the active tab. */
export function ComparePage(): React.JSX.Element | null {
  const state = useAppState();
  const active = activeTabOf(state.tabs);
  return active?.shows.kind === 'page' && active.shows.page === 'compare' ? (
    <TabPage key={active.id} tab={active.id} shows={active} />
  ) : null;
}
