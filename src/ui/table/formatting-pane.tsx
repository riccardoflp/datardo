/**
 * `table.formatting`: the Formatting view of the inspector island, beside the table of a collection tab. Its head adds
 * a rule (`table.add-format-rule`) and hides or shows formatting (`table.toggle-formatting`); its list is the
 * collection's rules, changed in place (`table.edit-format-rule`), the table following each change.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isFull, newConditionRule } from '../../features/table/add-format-rule';
import type { RuleChange } from '../../features/table/edit-format-rule';
import { view, type FormattingView, type RuleLine } from '../../features/table/formatting';
import { text } from '../../features/table/text';
import type { ColumnNode } from '../../features/table/types';
import { isFieldRule, type FormatRule, type FormatRuleId, type PresetColor } from '../../shared/formatting-rules';
import type { TabId } from '../../shared/ids';
import { collectionRefOf, type CollectionRef } from '../query/collection-reads';
import { useCollection, type CollectionTab } from '../query/collection-store';
import { focusIn, focusLine, isNewFocusRequest, lineControls, lineElement, listKeyOf } from './formatting-keys';
import { FormattingLine } from './formatting-line';
import { FormattingOpen } from './formatting-open';
import { useCollectionFormatting, useTableFormat, type CollectionFormatting } from './formatting-rules';
import { addRule, changeDraft, editRules, flushTyping, openRule, showNote, typedRule } from './formatting-store';
import { useTableColumns } from './table-columns';
import { startOnCollection } from './table-start';
import styles from './formatting.module.css';
import menuStyles from './table-panels.module.css';

function columnKeys(columns: readonly ColumnNode[]): readonly string[] {
  return columns.flatMap((column) => [column.key, ...columnKeys(column.children ?? [])]);
}

/**
 * **Add rule…** › **Condition…**: a new row rule, open, with the focus in its condition; with 100 rules already, the
 * line *A collection keeps at most 100 formatting rules.* in its place.
 */
export function addConditionRule(ref: CollectionRef, formatting: CollectionFormatting, now: number): void {
  if (isFull(formatting.saved)) {
    showNote(formatting.key, text.formatting.tooMany);
    return;
  }
  showNote(formatting.key, undefined);
  addRule(ref, newConditionRule(crypto.randomUUID(), formatting.rules), now);
}

function Head({
  shown,
  onAdd,
  collectionRef,
}: {
  readonly shown: FormattingView;
  readonly onAdd: () => void;
  readonly collectionRef: CollectionRef;
}): React.JSX.Element {
  const { add, toggle } = shown.head;
  return (
    <div className={styles['head']}>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={menuStyles['button']} data-feature="table.add-format-rule@inspector">
            {add.label}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={menuStyles['menu']} aria-label={add.label} align="start">
            {add.entries.map((entry) => (
              <DropdownMenu.Item key={entry.label} className={menuStyles['item']} title={entry.tip} onSelect={onAdd}>
                {entry.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
    </div>
  );
}

/** A change of a rule: the line of what it could not do is dropped, and a new rule not saved is changed in place. */
function changeRule(ref: CollectionRef, formatting: CollectionFormatting, change: RuleChange): void {
  showNote(formatting.key, undefined);
  const draft = formatting.memory.draft;
  const id = change.kind === 'set' ? change.rule.id : change.id;
  if (draft !== undefined && draft.id === id && !formatting.saved.some((rule) => rule.id === id)) {
    if (change.kind === 'remove') {
      changeDraft(formatting.key, undefined);
      openRule(formatting.key, undefined);
    }
    return;
  }
  flushTyping();
  editRules(ref, change);
}

/** The color of the open rule chosen. */
function colorRule(ref: CollectionRef, formatting: CollectionFormatting, color: PresetColor, now: number): void {
  const { open, draft } = formatting.memory;
  const rule = formatting.rules.find((each) => each.id === open?.id);
  if (open === undefined || rule === undefined || isFieldRule(rule)) {
    return;
  }
  if (draft?.id === rule.id && !formatting.saved.some((each) => each.id === rule.id)) {
    changeDraft(formatting.key, { ...draft, color });
    return;
  }
  flushTyping();
  editRules(ref, { kind: 'set', rule: { ...typedRule(rule, open, now), color } });
}

interface ListProps {
  readonly shown: FormattingView;
  readonly collectionRef: CollectionRef;
  readonly formatting: CollectionFormatting;
  readonly collection: CollectionTab;
  readonly root: React.RefObject<HTMLDivElement | null>;
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
      openRule(props.formatting.key, rulesById(props.formatting.rules, line.id), 'name');
      return;
    case 'menu':
      act.setMenu(line.id);
  }
}

function rulesById(rules: readonly FormatRule[], id: FormatRuleId): FormatRule | undefined {
  return rules.find((rule) => rule.id === id);
}

function RuleList(props: ListProps): React.JSX.Element {
  const { shown, collectionRef: ref, formatting, collection } = props;
  const [active, setActive] = useState<FormatRuleId | undefined>(undefined);
  const [menu, setMenu] = useState<FormatRuleId | undefined>(undefined);
  const { columns } = useTableColumns(ref, collection);
  const keys = useMemo(() => columnKeys(columns), [columns]);
  const activeId = shown.lines.some((line) => line.id === active) ? active : shown.lines[0]?.id;
  const lineOf = (line: RuleLine, index: number): React.JSX.Element => (
    <li key={line.id} data-rule={line.id} className={styles['item']}>
      <FormattingLine
        line={line}
        active={line.id === activeId}
        menuOpen={menu === line.id}
        onMenu={(open) => {
          setMenu(open ? line.id : undefined);
        }}
        onChange={(change) => {
          changeRule(ref, formatting, change);
        }}
        onOpen={() => {
          openRule(formatting.key, line.open ? undefined : rulesById(formatting.rules, line.id));
        }}
        onFocus={() => {
          setActive(line.id);
        }}
        onDrop={(dragged) => {
          changeRule(ref, formatting, { kind: 'move', id: dragged, to: index });
        }}
      />
      {shown.open?.id === line.id ? (
        <FormattingOpen
          open={shown.open}
          collectionRef={ref}
          now={collection.ranAt}
          columns={keys}
          onColor={(color) => {
            colorRule(ref, formatting, color, collection.ranAt);
          }}
          onClose={() => {
            openRule(formatting.key, undefined);
            focusLine(props.root.current, line.id);
          }}
        />
      ) : null}
    </li>
  );
  return (
    <ul
      className={styles['list']}
      aria-label={shown.listLabel}
      onKeyDown={(event) => {
        keyOnList(event, props, { active: activeId, setMenu });
      }}
    >
      {shown.lines.map(lineOf)}
    </ul>
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
  const root = useRef<HTMLDivElement>(null);
  const { memory, key } = formatting;
  const shown = view({
    rules: formatting.rules,
    ...(memory.draft === undefined ? {} : { draft: memory.draft.id }),
    problems: new Map(format.problems.map((problem) => [problem.rule, problem.message])),
    hidden: formatting.hidden,
    ...(memory.note === undefined ? {} : { note: memory.note }),
    ...(memory.open === undefined ? {} : { open: memory.open }),
    ...(formatting.typedProblem === undefined ? {} : { typedProblem: formatting.typedProblem }),
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
        onAdd={() => {
          addConditionRule(ref, formatting, now);
        }}
      />
      {shown.note === undefined ? null : (
        <p className={styles['note']} role="status">
          {shown.note}
        </p>
      )}
      {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
      {shown.lines.length === 0 ? null : (
        <RuleList shown={shown} collectionRef={ref} formatting={formatting} collection={collection} root={root} />
      )}
    </div>
  );
}

/** The Formatting view of the collection tab `tab`. */
export function FormattingPane({ tab }: { readonly tab: TabId }): React.JSX.Element | null {
  const ref = collectionRefOf(tab);
  return ref === undefined ? null : <Pane collectionRef={ref} tab={tab} />;
}
