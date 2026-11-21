/**
 * The toolbar of a value that is not a string, drawn from the View of `value.show`: **Filter fields** and **Add field**
 * of a hash; **From the head**, **From the tail**, **Go to index**, **Push…** and **Trim…** of a list; **Filter
 * members** and **Add member** of a set; **Lowest first**, **Highest first**, **Min score**, **Max score** and **Add
 * member** of a sorted set; **Newest first**, **Oldest first**, **From**, **To**, **Add entry** and **Trim…** of a
 * stream; then the count. `Enter` in a field reads the first page again with what it holds; what that read refuses is
 * said under the toolbar.
 */
import { foundText } from '../../../features/value/count';
import type { ValueView } from '../../../features/value/show';
import { isValueType } from '../../../features/value/types';
import type { Json } from '../../../shared/engine-request';
import { startForm, type FormWrite } from './value-actions';
import { firstArg, readFromToolbar } from './value-pages';
import { applyFilter } from './value-reads';
import { changeValue, type ValueTab } from './value-store';
import styles from './value.module.css';

/** What the parts of the toolbar are drawn with. */
interface ToolbarProps {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly shown: ValueView;
}

/** A button of the toolbar that reads the first page again another way, pressed while it is the way read. */
function ReadButton(props: {
  readonly tabId: string;
  readonly label: string;
  readonly element: string;
  readonly pressed: boolean;
  readonly change: Readonly<Record<string, Json>>;
}) {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={props.element}
      aria-pressed={props.pressed}
      onClick={() => void readFromToolbar(props.tabId, props.change)}
    >
      {props.label}
    </button>
  );
}

/** A field of the toolbar whose `Enter` reads the first page again: **Go to index**, **Min score**, **From**… */
function ReadField(props: {
  readonly tabId: string;
  readonly tab: ValueTab;
  readonly label: string;
  readonly element: string;
  readonly change: () => Readonly<Record<string, Json>>;
}) {
  const { tabId, tab, label } = props;
  return (
    <input
      type="text"
      className={styles['short-input']}
      placeholder={label}
      aria-label={label}
      data-feature={props.element}
      value={tab.typed[label] ?? ''}
      onChange={(event) => {
        const value = event.target.value;
        changeValue(tabId, (now) => ({ ...now, typed: { ...now.typed, [label]: value } }));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void readFromToolbar(tabId, props.change());
        }
      }}
    />
  );
}

/** A button of the toolbar that opens the form of a write. */
function FormButton(props: {
  readonly tabId: string;
  readonly label: string;
  readonly element: string;
  readonly feature: FormWrite;
}) {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={props.element}
      onClick={() => void startForm(props.tabId, props.feature)}
    >
      {props.label}
    </button>
  );
}

/** **Filter fields** or **Filter members**: `Enter` scans again from cursor 0 with what is typed. */
function FilterField(props: ToolbarProps & { readonly label: string; readonly element: string }) {
  const { tabId, tab, label } = props;
  return (
    <input
      type="search"
      className={styles['input']}
      placeholder={label}
      aria-label={label}
      data-feature={props.element}
      value={tab.field}
      onChange={(event) => {
        const field = event.target.value;
        changeValue(tabId, (now) => ({ ...now, field }));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void applyFilter(tabId);
        }
      }}
    />
  );
}

function HashTools(props: ToolbarProps & { readonly has: (label: string) => boolean }) {
  const { tabId, has } = props;
  return (
    <>
      {has('Filter fields') ? <FilterField {...props} label="Filter fields" element="value.read-hash@toolbar" /> : null}
      {has('Add field') ? (
        <FormButton tabId={tabId} label="Add field" element="value.add-field@toolbar" feature="value.add-field" />
      ) : null}
    </>
  );
}

function ListTools(props: ToolbarProps & { readonly has: (label: string) => boolean }) {
  const { tabId, tab, has } = props;
  const from = firstArg(tab, 'from');
  const index = (): Readonly<Record<string, Json>> => {
    const typed = (tab.typed['Go to index'] ?? '').trim();
    return typed === '' ? { from: 'head', index: '0' } : { from: 'index', index: typed };
  };
  return (
    <>
      <ReadButton
        tabId={tabId}
        label="From the head"
        element="value.read-list@toolbar"
        pressed={from === 'head'}
        change={{ from: 'head', index: '0' }}
      />
      <ReadButton
        tabId={tabId}
        label="From the tail"
        element="value.read-list@toolbar"
        pressed={from === 'tail'}
        change={{ from: 'tail', index: '0' }}
      />
      <ReadField tabId={tabId} tab={tab} label="Go to index" element="value.read-list@toolbar" change={index} />
      {has('Push…') ? (
        <FormButton tabId={tabId} label="Push…" element="value.push-element@toolbar" feature="value.push-element" />
      ) : null}
      {has('Trim…') ? (
        <FormButton tabId={tabId} label="Trim…" element="value.trim-list@toolbar" feature="value.trim-list" />
      ) : null}
    </>
  );
}

function SetTools(props: ToolbarProps & { readonly has: (label: string) => boolean }) {
  const { tabId, has } = props;
  return (
    <>
      <FilterField {...props} label="Filter members" element="value.read-set@toolbar" />
      {has('Add member') ? (
        <FormButton tabId={tabId} label="Add member" element="value.add-member@toolbar" feature="value.add-member" />
      ) : null}
    </>
  );
}

function SortedSetTools(props: ToolbarProps & { readonly has: (label: string) => boolean }) {
  const { tabId, tab, has } = props;
  const order = firstArg(tab, 'order');
  const range = (): Readonly<Record<string, Json>> => ({
    min: tab.typed['Min score'] ?? '',
    max: tab.typed['Max score'] ?? '',
  });
  return (
    <>
      <ReadButton
        tabId={tabId}
        label="Lowest first"
        element="value.read-sorted-set@toolbar"
        pressed={order !== 'highest'}
        change={{ order: 'lowest' }}
      />
      <ReadButton
        tabId={tabId}
        label="Highest first"
        element="value.read-sorted-set@toolbar"
        pressed={order === 'highest'}
        change={{ order: 'highest' }}
      />
      <ReadField tabId={tabId} tab={tab} label="Min score" element="value.read-sorted-set@toolbar" change={range} />
      <ReadField tabId={tabId} tab={tab} label="Max score" element="value.read-sorted-set@toolbar" change={range} />
      {has('Add member') ? (
        <FormButton
          tabId={tabId}
          label="Add member"
          element="value.add-scored-member@toolbar"
          feature="value.add-scored-member"
        />
      ) : null}
    </>
  );
}

function StreamTools(props: ToolbarProps & { readonly has: (label: string) => boolean }) {
  const { tabId, tab, has } = props;
  const order = firstArg(tab, 'order');
  const range = (): Readonly<Record<string, Json>> => ({ from: tab.typed['From'] ?? '', to: tab.typed['To'] ?? '' });
  return (
    <>
      <ReadButton
        tabId={tabId}
        label="Newest first"
        element="value.read-stream@toolbar"
        pressed={order !== 'oldest'}
        change={{ order: 'newest' }}
      />
      <ReadButton
        tabId={tabId}
        label="Oldest first"
        element="value.read-stream@toolbar"
        pressed={order === 'oldest'}
        change={{ order: 'oldest' }}
      />
      <ReadField tabId={tabId} tab={tab} label="From" element="value.read-stream@toolbar" change={range} />
      <ReadField tabId={tabId} tab={tab} label="To" element="value.read-stream@toolbar" change={range} />
      {has('Add entry') ? (
        <FormButton tabId={tabId} label="Add entry" element="value.add-entry@toolbar" feature="value.add-entry" />
      ) : null}
      {has('Trim…') ? (
        <FormButton tabId={tabId} label="Trim…" element="value.trim-stream@toolbar" feature="value.trim-stream" />
      ) : null}
    </>
  );
}

const toolsOf: Readonly<
  Record<string, (props: ToolbarProps & { readonly has: (label: string) => boolean }) => React.JSX.Element>
> = { hash: HashTools, list: ListTools, set: SetTools, zset: SortedSetTools, stream: StreamTools };

/** The toolbar of the table, its count, and under it what a read of the toolbar refused. */
export function TableToolbar(props: ToolbarProps): React.JSX.Element {
  const { tab, shown } = props;
  const has = (label: string): boolean => shown.toolbar.some((control) => control.label === label);
  const found =
    tab.filter !== '' && isValueType(tab.type) && tab.count !== undefined
      ? foundText(tab.type, tab.rows.length, tab.count)
      : undefined;
  const Tools = toolsOf[tab.type];
  return (
    <>
      <div className={styles['toolbar']} role="toolbar" aria-label="Value">
        {Tools === undefined ? null : <Tools {...props} has={has} />}
        <span className={styles['count']}>{found ?? shown.count}</span>
      </div>
      {tab.problem === undefined ? null : (
        <p className={styles['problem']} role="alert">
          {tab.problem}
        </p>
      )}
    </>
  );
}
