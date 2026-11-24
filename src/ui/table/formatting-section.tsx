/**
 * A section of the Formatting view (`table.formatting`): its head, with the checkbox that leaves its rules out of the
 * collection, its title and its count, on which a line is dropped to move its rule last into it
 * (`table.move-format-rule`); and its rules, each line with the open rule under it.
 */
import { useState } from 'react';
import type { FormattingView, RuleLine, SectionView } from '../../features/table/formatting';
import { isFieldRule, type FormatRuleId } from '../../shared/formatting-rules';
import type { CollectionRef } from '../query/collection-reads';
import type { CollectionTab } from '../query/collection-store';
import { changeRule, colorRule, moveRule, rulesById } from './formatting-changes';
import { focusLine } from './formatting-keys';
import { draggedRule, FormattingLine } from './formatting-line';
import { FormattingOpen } from './formatting-open';
import type { CollectionFormatting } from './formatting-rules';
import { openRule } from './formatting-store';
import styles from './formatting.module.css';

/** What the sections are given. */
export interface ListProps {
  readonly shown: FormattingView;
  readonly collectionRef: CollectionRef;
  readonly formatting: CollectionFormatting;
  readonly collection: CollectionTab;
  readonly root: React.RefObject<HTMLDivElement | null>;
}

/** Where a line dropped on another goes: reordered in its own section, else moved beside it. */
function dropOnLine(
  props: ListProps,
  section: SectionView,
  target: RuleLine,
  drop: { id: FormatRuleId; after: boolean },
): void {
  const { collectionRef: ref, formatting } = props;
  const from = section.lines.findIndex((line) => line.id === drop.id);
  if (from < 0) {
    moveRule(ref, formatting, { id: drop.id, to: section.scope, copy: false, beside: target.id, after: drop.after });
    return;
  }
  const index = section.lines.findIndex((line) => line.id === target.id);
  const to = index - (from < index ? 1 : 0) + (drop.after ? 1 : 0);
  changeRule(ref, formatting, { kind: 'move', id: drop.id, to });
}

/** What a section is given. */
export interface SectionProps extends ListProps {
  readonly section: SectionView;
  readonly activeId: FormatRuleId | undefined;
  readonly menu: FormatRuleId | undefined;
  readonly setMenu: (id: FormatRuleId | undefined) => void;
  readonly setActive: (id: FormatRuleId) => void;
  readonly columns: readonly string[];
}

function SectionLine(props: SectionProps & { readonly line: RuleLine }): React.JSX.Element {
  const { shown, collectionRef: ref, formatting, collection, line, section } = props;
  const rule = rulesById(formatting, line.id);
  return (
    <li data-rule={line.id} className={styles['item']}>
      <FormattingLine
        line={line}
        active={line.id === props.activeId}
        menuOpen={props.menu === line.id}
        onMenu={(open) => {
          props.setMenu(open ? line.id : undefined);
        }}
        onChange={(change) => {
          changeRule(ref, formatting, change);
        }}
        onMove={(move) => {
          moveRule(ref, formatting, move);
        }}
        onOpen={() => {
          openRule(formatting.key, line.open ? undefined : rule);
        }}
        onFocus={() => {
          props.setActive(line.id);
        }}
        onDrop={(dragged, after) => {
          dropOnLine(props, section, line, { id: dragged, after });
        }}
      />
      {shown.open?.id === line.id ? (
        <FormattingOpen
          open={shown.open}
          collectionRef={ref}
          now={collection.ranAt}
          columns={props.columns}
          {...(rule !== undefined && isFieldRule(rule) ? { fieldRule: rule } : {})}
          documents={collection.documents}
          memoryKey={formatting.key}
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
}

/** A section, its head and its rules. */
export function Section(props: SectionProps): React.JSX.Element {
  const { section, collectionRef: ref, formatting } = props;
  const [over, setOver] = useState(false);
  return (
    <section
      className={styles['section']}
      data-scope={section.scope}
      data-dimmed={section.dimmed}
      aria-label={section.title}
    >
      <div
        className={styles['section-head']}
        data-drop={over}
        title={section.tip}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(draggedRule)) {
            event.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={(event) => {
          setOver(false);
          const dragged = event.dataTransfer.getData(draggedRule);
          if (dragged !== '') {
            event.preventDefault();
            moveRule(ref, formatting, { id: dragged, to: section.scope, copy: false });
          }
        }}
      >
        <input
          type="checkbox"
          className={styles['check']}
          data-feature="table.edit-format-rule@inspector"
          checked={section.check.checked}
          aria-label={section.check.label}
          title={section.check.label}
          onChange={() => {
            changeRule(ref, formatting, section.check.change);
          }}
        />
        <span className={styles['section-title']}>{section.title}</span>
        <span className={styles['count']}>{section.count}</span>
      </div>
      {section.lines.length === 0 ? null : (
        <ul className={styles['list']} aria-label={section.title}>
          {section.lines.map((line) => (
            <SectionLine key={line.id} {...props} line={line} />
          ))}
        </ul>
      )}
    </section>
  );
}
