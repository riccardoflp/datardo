/**
 * `structure.show`: the structure comparison page of the active tab. From the top: the sides (**Left · model**, **⇄**,
 * **Right · changed by the script** with its two lists), the sentence on what the script does and **Compare**, the
 * counts and the notes, the toolbar, the progress and the error lines, then the differences grouped by collection;
 * selecting a row, with a click or the arrow keys, shows its detail in the inspector island, and `Enter` moves the
 * focus there.
 */
import { useEffect } from 'react';
import { view, type PageControl, type StructurePageView } from '../../../features/structure/show';
import { activeTabOf, type Tab } from '../../../shared/state/tabs';
import { currentAppState, useAppState } from '../../state/store';
import { StructureList } from './structure-list';
import {
  chooseConnection,
  chooseDatabase,
  compareStructures,
  keepStructure,
  openStructure,
  setChoice,
  startOperation,
  swapStructures,
} from './structure-runs';
import { pressStructureChip, useStructureTab } from './structure-store';
import styles from './structure-page.module.css';

/** A sentence with words in `**` drawn strong, as the card writes them. */
export function Strong({ sentence }: { readonly sentence: string }): React.JSX.Element {
  return (
    <>{sentence.split('**').map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))}</>
  );
}

/** A button of the page: disabled with `aria-disabled`, its reason in its tooltip. */
export function ControlButton(props: {
  readonly control: PageControl;
  readonly pressed?: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  const { control, pressed, onPress } = props;
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={control.element}
      title={control.hint}
      aria-pressed={pressed}
      aria-disabled={control.enabled ? undefined : true}
      onClick={() => {
        if (control.enabled) onPress();
      }}
    >
      {control.label}
    </button>
  );
}

function Sides({ tab, shown }: { readonly tab: string; readonly shown: StructurePageView }): React.JSX.Element {
  const { right } = shown;
  return (
    <div className={styles['sides']} role="group" aria-label={shown.title}>
      <span className={styles['label']}>{shown.left.label}</span>
      <code className={styles['namespace']}>{shown.left.database}</code>
      <span className={styles['muted']}>{shown.left.connection}</span>
      <button
        type="button"
        className={styles['button']}
        title={shown.swap.hint}
        aria-label={shown.swap.hint}
        aria-disabled={shown.swap.enabled ? undefined : true}
        onClick={() => {
          if (shown.swap.enabled) swapStructures(tab);
        }}
      >
        {shown.swap.label}
      </button>
      <span className={styles['label']}>{right.label}</span>
      <label className={styles['field']} title={right.connection.hint}>
        <span>{right.connection.label}</span>
        <select
          className={styles['select']}
          aria-label={right.connection.label}
          value={right.connection.value ?? ''}
          onChange={(event) => {
            if (event.target.value !== '') void chooseConnection(tab, event.target.value, undefined, 'first-time');
          }}
        >
          {right.connection.value === undefined ? <option value="">—</option> : null}
          {right.connections.map((each) => (
            <option key={each.id} value={each.id}>
              {[each.label, ...each.notes].join(' · ')}
            </option>
          ))}
        </select>
      </label>
      <label className={styles['field']}>
        <span>{right.database.label}</span>
        <select
          className={styles['select']}
          aria-label={right.database.label}
          value={right.database.value ?? ''}
          onChange={(event) => {
            if (event.target.value !== '') chooseDatabase(tab, event.target.value);
          }}
        >
          {right.database.value === undefined ? <option value="">—</option> : null}
          {right.databases.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {right.readOnly === undefined ? null : (
        <span className={styles['badge']} title={right.readOnly.hint}>
          {right.readOnly.label}
        </span>
      )}
      {right.message === undefined ? null : <p className={styles['message']}>{right.message}</p>}
    </div>
  );
}

function Counts({ tab, shown }: { readonly tab: string; readonly shown: StructurePageView }): React.JSX.Element {
  return (
    <div className={styles['counts']}>
      <span className={styles['grow']}>
        <Strong sentence={shown.explanation} />
      </span>
      <ControlButton control={shown.compare} onPress={() => void compareStructures(tab)} />
      {shown.chips === undefined ? null : (
        <span className={styles['message']}>
          {shown.chips.map((chip) => (
            <button
              key={chip.kind}
              type="button"
              className={styles['chip']}
              title={chip.hint}
              aria-pressed={chip.pressed}
              aria-disabled={chip.enabled ? undefined : true}
              onClick={() => {
                if (!chip.enabled) return;
                pressStructureChip(tab, chip.kind);
                keepStructure(tab);
              }}
            >
              {chip.label}
            </button>
          ))}{' '}
          {shown.summary}
        </span>
      )}
      {shown.notes.map((note) => (
        <p key={note} className={styles['message']}>
          {note}
        </p>
      ))}
    </div>
  );
}

function Toolbar({ tab, shown }: { readonly tab: string; readonly shown: StructurePageView }): React.JSX.Element {
  const { toolbar } = shown;
  return (
    <div className={styles['bulk']} role="toolbar" aria-label={shown.title}>
      <ControlButton
        control={toolbar.onlyDifferences}
        pressed={toolbar.onlyDifferences.on}
        onPress={() => {
          setChoice(tab, { showAll: false });
        }}
      />
      <ControlButton
        control={toolbar.all}
        pressed={toolbar.all.on}
        onPress={() => {
          setChoice(tab, { showAll: true });
        }}
      />
      <label className={styles['check']} title={toolbar.includeDrops.hint}>
        <input
          type="checkbox"
          checked={toolbar.includeDrops.on}
          onChange={(event) => {
            setChoice(tab, { drops: event.target.checked });
          }}
        />
        {toolbar.includeDrops.label}
      </label>
      <span className={styles['grow']} />
      <ControlButton
        control={toolbar.copyScript}
        onPress={() => void startOperation(tab, 'structure.copy-script', 'toolbar')}
      />
      <ControlButton
        control={toolbar.openInPlayground}
        onPress={() => void startOperation(tab, 'structure.open-in-playground', 'toolbar')}
      />
      <ControlButton
        control={toolbar.applyAll}
        onPress={() => void startOperation(tab, 'structure.apply', 'toolbar')}
      />
    </div>
  );
}

/** The detail of the work in progress of the tab's read, when it has appeared. */
function progressOf(work: string | undefined): string | undefined {
  return work === undefined ? undefined : currentAppState().runner.work.find((each) => each.id === work)?.detail;
}

function TabPage({ tab, shows }: { readonly tab: string; readonly shows: Tab }): React.JSX.Element | null {
  useAppState();
  useEffect(() => {
    openStructure(tab, shows.shows, shows.memory?.choices);
    // The page opens once for its tab: what the tab keeps is read only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const page = useStructureTab(tab);
  if (page === undefined) {
    return null;
  }
  const progressText = page.page.comparing ? progressOf(page.work) : undefined;
  const shown = view(progressText === undefined ? page.page : { ...page.page, progressText });
  return (
    <div className={styles['page']}>
      <Sides tab={tab} shown={shown} />
      <Counts tab={tab} shown={shown} />
      <Toolbar tab={tab} shown={shown} />
      {shown.progress === undefined ? null : (
        <p className={styles['line']} role="status">
          {shown.progress}
        </p>
      )}
      {shown.error === undefined ? null : (
        <p className={styles['error']} role="alert">
          {shown.error}
        </p>
      )}
      <StructureList tab={tab} shown={shown} />
    </div>
  );
}

/** The structure comparison page of the active tab. */
export function StructurePage(): React.JSX.Element | null {
  const state = useAppState();
  const active = activeTabOf(state.tabs);
  return active?.shows.kind === 'page' && active.shows.page === 'structure' ? (
    <TabPage key={active.id} tab={active.id} shows={active} />
  ) : null;
}
