/**
 * `table.formatting`: the Formatting view of the inspector island, beside the table of a collection tab. Its head adds
 * a rule (`table.add-format-rule`, `table.color-by-field`), hides or shows formatting (`table.toggle-formatting`) and
 * exports or imports rules (`table.export-formatting`, `table.import-formatting`); its four sections are the rules that
 * reach the collection, changed in place (`table.edit-format-rule`, `table.edit-field-rule`), dragged or moved between
 * sections (`table.move-format-rule`), each section's checkbox leaving its rules out of the collection; the table
 * follows each change.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import { view, type FormattingEntry, type FormattingView } from '../../features/table/formatting';
import type { ColumnNode } from '../../features/table/types';
import type { FormatRuleId } from '../../shared/formatting-rules';
import type { TabId } from '../../shared/ids';
import { collectionRefOf, type CollectionRef } from '../query/collection-reads';
import { useCollection } from '../query/collection-store';
import { useAppState } from '../state/store';
import { addByField, addConditionRule, changeRule, rulesById } from './formatting-changes';
import { focusIn, focusLine, isNewFocusRequest, lineControls, lineElement, listKeyOf } from './formatting-keys';
import { useCollectionFormatting, useTableFormat } from './formatting-rules';
import { Section, type ListProps } from './formatting-section';
import { changeDraft, flushTyping, openRule } from './formatting-store';
import { useTableColumns } from './table-columns';
import { startOnCollection } from './table-start';
import styles from './formatting.module.css';
import menuStyles from './table-panels.module.css';

function columnKeys(columns: readonly ColumnNode[]): readonly string[] {
  return columns.flatMap((column) => [column.key, ...columnKeys(column.children ?? [])]);
}

/**
 * A button of the head that opens a menu. With `takesFocus`, an entry chosen puts the focus where it opens a rule, not
 * back on the button.
 */
function MenuButton({
  label,
  element,
  icon,
  entries,
  onChoose,
  takesFocus = false,
}: {
  readonly label: string;
  readonly element?: string;
  readonly icon?: string;
  readonly entries: readonly FormattingEntry[];
  readonly onChoose: (entry: FormattingEntry) => void;
  readonly takesFocus?: boolean;
}): React.JSX.Element {
  const chosen = useRef(false);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={icon === undefined ? menuStyles['button'] : styles['icon-button']}
          data-feature={element}
          aria-label={icon === undefined ? undefined : label}
          title={icon === undefined ? undefined : label}
        >
          {icon === undefined ? label : <span className={`codicon ${icon}`} aria-hidden="true" />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menuStyles['menu']}
          aria-label={label}
          align="start"
          onCloseAutoFocus={(event) => {
            if (chosen.current) {
              chosen.current = false;
              event.preventDefault();
            }
          }}
        >
          {entries.map((entry) => (
            <DropdownMenu.Item
              key={entry.label}
              className={menuStyles['item']}
              data-feature={entry.element}
              title={entry.tip}
              onSelect={() => {
                chosen.current = takesFocus;
                onChoose(entry);
              }}
            >
              {entry.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Head({
  shown,
  onAdd,
  collectionRef,
}: {
  readonly shown: FormattingView;
  readonly onAdd: (element: string) => void;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const { add, toggle, more } = shown.head;
  return (
    <div className={styles['head']}>
      <MenuButton
        label={add.label}
        element="table.add-format-rule@inspector"
        entries={add.entries}
        takesFocus
        onChoose={(entry) => {
          onAdd(entry.element);
        }}
      />
      <button
        type="button"
        className={menuStyles['button']}
        data-feature={toggle.element}
        title={toggle.tip}
        aria-pressed={toggle.hidden}
        onClick={() => {
          void startOnCollection(collectionRef, toggle.element, {});
        }}
      >
        {toggle.label}
      </button>
      <MenuButton
        label={more.label}
        icon="codicon-ellipsis"
        entries={more.entries}
        onChoose={(entry) => {
          void startOnCollection(collectionRef, entry.element, {});
        }}
      />
    </div>
  );
}

function keyOnList(
  event: React.KeyboardEvent,
  props: ListProps,
  act: { readonly active: FormatRuleId | undefined; readonly setMenu: (id: FormatRuleId) => void },
): void {
  const asked = listKeyOf(event);
  const { lines } = props.shown;
  const index = lines.findIndex((line) => line.id === act.active);
  const line = lines[index];
  if (
    asked === undefined ||
    line === undefined ||
    (event.target as HTMLElement).closest('[data-line-control]') === null
  ) {
    return;
  }
  event.preventDefault();
  const list = props.root.current;
  switch (asked.kind) {
    case 'line': {
      const next = lines[index + asked.by];
      if (next !== undefined) {
        focusLine(list, next.id);
      }
      return;
    }
    case 'control': {
      const controls = lineControls(lineElement(list, line.id));
      const at = controls.indexOf(event.target as HTMLElement);
      controls[at + asked.by]?.focus();
      return;
    }
    case 'move':
      changeRule(props.collectionRef, props.formatting, { kind: 'step', id: line.id, by: asked.by });
      return;
    case 'name':
      openRule(props.formatting.key, rulesById(props.formatting, line.id), 'name');
      return;
    case 'menu':
      act.setMenu(line.id);
  }
}

function RuleSections(props: ListProps): React.JSX.Element {
  const { shown, collectionRef: ref, collection } = props;
  const [active, setActive] = useState<FormatRuleId | undefined>(undefined);
  const [menu, setMenu] = useState<FormatRuleId | undefined>(undefined);
  const { columns } = useTableColumns(ref, collection);
  const keys = useMemo(() => columnKeys(columns), [columns]);
  const activeId = shown.lines.some((line) => line.id === active) ? active : shown.lines[0]?.id;
  return (
    <div
      className={styles['sections']}
      role="group"
      aria-label={shown.listLabel}
      onKeyDown={(event) => {
        keyOnList(event, props, { active: activeId, setMenu });
      }}
    >
      {shown.sections.map((section) => (
        <Section
          key={section.scope}
          {...props}
          section={section}
          activeId={activeId}
          menu={menu}
          setMenu={setMenu}
          setActive={setActive}
          columns={keys}
        />
      ))}
    </div>
  );
}

function Pane({
  collectionRef: ref,
  tab,
}: {
  readonly collectionRef: CollectionRef;
  readonly tab: TabId;
}): React.JSX.Element {
  const collection = useCollection(tab);
  const now = collection.ranAt;
  const formatting = useCollectionFormatting(ref, now);
  const format = useTableFormat(formatting, collection.documents, now);
  const state = useAppState();
  const root = useRef<HTMLDivElement>(null);
  const { memory, key } = formatting;
  const connection = state.connections.saved.find((each) => each.id === ref.connection)?.name ?? ref.connection;
  const shown = view({
    sections: formatting.sections,
    off: formatting.off,
    names: { database: ref.database, connection },
    ...(memory.draft === undefined ? {} : { draft: memory.draft.id }),
    problems: new Map(format.problems.map((problem) => [problem.rule, problem.message])),
    hidden: formatting.hidden,
    ...(memory.note === undefined ? {} : { note: memory.note }),
    ...(memory.open === undefined ? {} : { open: memory.open }),
    ...(formatting.typedProblem === undefined ? {} : { typedProblem: formatting.typedProblem }),
    documents: collection.documents,
    now,
  });
  useEffect(() => {
    if (isNewFocusRequest(key, memory)) {
      focusIn(root.current, memory.focus.on, memory.open?.id);
    }
  }, [key, memory]);
  // A new rule not saved yet is dropped when the view is left.
  useEffect(
    () => () => {
      flushTyping();
      changeDraft(key, undefined);
    },
    [key],
  );
  return (
    <div ref={root} className={styles['pane']} data-feature="table.formatting@inspector">
      <Head
        shown={shown}
        collectionRef={ref}
        onAdd={(element) => {
          if (element === 'table.color-by-field@inspector') {
            addByField(ref, formatting, collection.documents);
          } else {
            addConditionRule(ref, formatting, now);
          }
        }}
      />
      {shown.note === undefined ? null : (
        <p className={styles['note']} role="status">
          {shown.note}
        </p>
      )}
      {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
      <RuleSections shown={shown} collectionRef={ref} formatting={formatting} collection={collection} root={root} />
    </div>
  );
}

/** The Formatting view of the collection tab `tab`. */
export function FormattingPane({ tab }: { readonly tab: TabId }): React.JSX.Element | null {
  const ref = collectionRefOf(tab);
  return ref === undefined ? null : <Pane collectionRef={ref} tab={tab} />;
}
