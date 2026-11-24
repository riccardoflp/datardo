/**
 * One card of the stage list of the pipeline editor (`aggregate.show`): its number, which shows the output up to it
 * (`aggregate.show-stage`); its name with the templates as suggestions (`aggregate.stage-template`); the checkbox
 * **Enabled** (`aggregate.toggle-stage`); its marks (`aggregate.stage-marks`); **Move left**, **Move right**, or
 * **Move up**, **Move down** in the query pane (`aggregate.move-stage`) and **Remove stage** (`aggregate.remove-stage`); its body in Datardo's editor with its
 * suggestions (`aggregate.autocomplete`), where `Ctrl+Enter` runs the pipeline up to the stage shown. A right click,
 * `Shift+F10` or the menu key opens its context menu.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEffect, useId, useRef, useState } from 'react';
import type { EditorControl, PipelineEditorView, StageCard as Card } from '../../../features/aggregate/show';
import { text } from '../../../features/aggregate/text';
import type { FieldHint } from '../../../features/query/field-hints';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { readHints, type CollectionRef } from '../../query/collection-reads';
import { useQueryPlace } from '../../query/query-layout';
import { editBody, focusStage, pressControl, renameStage, runFromEditor } from './pipeline-actions';
import type { PipelineTab } from './pipeline-store';
import styles from './pipeline-editor.module.css';

/** What a card is drawn with. */
export interface CardProps {
  readonly card: Card;
  readonly collectionRef: CollectionRef;
  readonly kept: PipelineTab;
  readonly fields: readonly FieldHint[];
  readonly sizes: PipelineEditorView['sizes'];
}

/** The width of a card: as wide as its longest line, within the sizes of the view. */
function widthOf(card: Card, sizes: PipelineEditorView['sizes']): string {
  const longest = Math.max(card.name.value.length, ...card.body.value.split('\n').map((line) => line.length));
  const [least, most] = sizes.cardWidth;
  return `clamp(${String(least)}px, calc(${String(longest + 4)}ch + 2rem), ${String(most)}px)`;
}

function IconButton({
  control,
  icon,
  collectionRef,
}: {
  readonly control: EditorControl;
  readonly icon: string;
  readonly collectionRef: CollectionRef;
}) {
  return (
    <button
      type="button"
      className={styles['icon']}
      data-feature={control.element}
      aria-label={control.label}
      title={control.label}
      disabled={control.disabled === true}
      onClick={() => {
        pressControl(collectionRef, control);
      }}
    >
      <span className={`codicon codicon-${icon}`} aria-hidden="true" />
    </button>
  );
}

function Marks({ card }: { readonly card: Card }): React.JSX.Element | null {
  const { marks } = card;
  if (marks.said.length === 0) {
    return null;
  }
  return (
    <ul className={styles['marks']} data-feature={marks.element} aria-label={text.editor.marks}>
      {marks.said.map((word) => (
        <li
          key={word}
          className={styles['mark']}
          data-mark={word === text.marks.writes || word === text.marks.mustBeFirst ? 'badge' : 'note'}
          title={word === text.marks.mustBeFirst ? marks.mustBeFirstWhy : undefined}
        >
          {word}
        </li>
      ))}
    </ul>
  );
}

function NameField({
  card,
  collectionRef,
  focus,
}: {
  readonly card: Card;
  readonly collectionRef: CollectionRef;
  readonly focus?: PipelineTab['focusName'];
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [focusedName, setFocusedName] = useState(card.name.value);
  const asked = focus?.stage === card.index ? focus.at : undefined;
  useEffect(() => {
    if (asked !== undefined) {
      input.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      input.current?.focus();
      input.current?.select();
    }
  }, [asked]);
  return (
    <>
      <input
        ref={input}
        className={styles['name']}
        type="text"
        list={listId}
        spellCheck={false}
        data-feature={card.name.element}
        aria-label={card.name.label}
        aria-invalid={card.marks.invalidName ? true : undefined}
        value={card.name.value}
        onFocus={() => {
          setFocusedName(card.name.value);
        }}
        onChange={(event) => {
          renameStage(collectionRef, card.index, event.target.value, focusedName);
        }}
      />
      <datalist id={listId}>
        {card.name.suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

function CardHead({ card, collectionRef, kept }: Pick<CardProps, 'card' | 'collectionRef' | 'kept'>) {
  return (
    <div className={styles['card-head']}>
      <button
        type="button"
        className={styles['number']}
        data-feature={card.show.element}
        title={card.show.label}
        aria-pressed={card.marks.shown}
        onClick={() => {
          pressControl(collectionRef, card.show);
        }}
      >
        {/* The name a screen reader says is the tooltip, as the card writes it; the number is seen on the card. */}
        <span aria-hidden="true">{card.number}</span>
      </button>
      <NameField
        card={card}
        collectionRef={collectionRef}
        {...(kept.focusName === undefined ? {} : { focus: kept.focusName })}
      />
      <input
        type="checkbox"
        className={styles['check']}
        data-feature={card.enabled.element}
        aria-label={card.enabled.label}
        title={card.enabled.label}
        checked={card.enabled.checked}
        onChange={() => {
          pressControl(collectionRef, card.enabled);
        }}
      />
      <span className={styles['spacer']} />
      <IconButton control={card.moveLeft} icon={card.moveLeft.icon ?? 'arrow-left'} collectionRef={collectionRef} />
      <IconButton control={card.moveRight} icon={card.moveRight.icon ?? 'arrow-right'} collectionRef={collectionRef} />
      <IconButton control={card.remove} icon="trash" collectionRef={collectionRef} />
    </div>
  );
}

function CardMenu({
  card,
  collectionRef,
  children,
}: {
  readonly card: Card;
  readonly collectionRef: CollectionRef;
  readonly children: React.JSX.Element;
}) {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles['menu']} aria-label={text.editor.menu(card.index + 1)}>
          {card.menu.map((entry) => (
            <ContextMenu.Item
              key={entry.label}
              className={styles['item']}
              data-feature={entry.element}
              disabled={entry.disabled === true}
              onSelect={() => {
                pressControl(collectionRef, entry);
              }}
            >
              {entry.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** A card of the stage list. */
export function StageCard({ card, collectionRef, kept, fields, sizes }: CardProps): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  // In the query pane each card is as wide as the pane: the width by the longest line is for the cards above the table.
  const side = useQueryPlace().side;
  const flash = kept.flash?.stage === card.index ? kept.flash.at : undefined;
  useEffect(() => {
    if (card.marks.error) {
      box.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [card.marks.error]);
  return (
    <CardMenu card={card} collectionRef={collectionRef}>
      <div
        ref={box}
        className={styles['card']}
        role="group"
        aria-label={text.editor.card(card.index + 1, card.name.value)}
        data-stage={card.index}
        data-dimmed={card.marks.dimmed}
        data-shown={card.marks.shown}
        data-error={card.marks.error}
        style={side ? undefined : { width: widthOf(card, sizes) }}
        onFocus={(event) => {
          if (event.target.closest('[data-field="stage-body"]') !== null) {
            focusStage(collectionRef, card.index);
          }
        }}
      >
        {flash === undefined ? null : <span key={flash} className={styles['flash']} aria-hidden="true" />}
        <CardHead card={card} collectionRef={collectionRef} kept={kept} />
        <Marks card={card} />
        <div className={styles['body']} data-feature={card.body.element}>
          <MongoshEditor
            label={card.body.label}
            field="stage-body"
            placeholder=""
            text={card.body.value}
            kind={{ stage: card.name.value.trim() }}
            fields={fields}
            multiline
            maxHeight={sizes.bodyHeight}
            invalid={card.marks.invalidBody}
            onChange={(written) => {
              editBody(collectionRef, card.index, written);
            }}
            onRun={() => {
              runFromEditor(collectionRef);
            }}
            onNeedFields={() => {
              void readHints(collectionRef);
            }}
          />
        </div>
      </div>
    </CardMenu>
  );
}
