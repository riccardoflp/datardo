/**
 * The pipeline editor of a collection tab in Aggregate (`aggregate.show`), in place of the fields of the query bar:
 * the stage list with **+**, or the text after **Edit as text**; the toolbar in two groups; the line of what the table
 * shows. In the query pane (`query.position`) the cards are one under the other, as wide as the pane. While
 * a cell or a column header of the table is dragged, the conditions it can add cover the editor
 * (`aggregate.drop-condition`).
 */
import { useEffect } from 'react';
import { fieldsForStage, tableOutput } from '../../../features/aggregate/autocomplete';
import { view, type EditorControl, type PipelineEditorView } from '../../../features/aggregate/show';
import { text } from '../../../features/aggregate/text';
import type { FieldHint } from '../../../features/query/field-hints';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { isBuilt } from '../../query/built';
import { readHints, type CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { useDragged } from '../../query/drag-data';
import { useQueryPlace } from '../../query/query-layout';
import { useAppState } from '../../state/store';
import { editText, pressControl, runWhole } from './pipeline-actions';
import { PipelineDropZones } from './pipeline-drop-zones';
import { readKept, usePipeline, type PipelineTab } from './pipeline-store';
import { StageCard } from './stage-card';
import './pipeline-hooks';
import styles from './pipeline-editor.module.css';

/** What the editor is drawn with. */
export interface PipelinePaneProps {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly readOnly: boolean;
}

function hintsOf(collection: CollectionTab): readonly FieldHint[] {
  return collection.hints.kind === 'read' ? collection.hints.fields : [];
}

function ControlButton({
  control,
  collectionRef,
}: {
  readonly control: EditorControl;
  readonly collectionRef: CollectionRef;
}) {
  return (
    <button
      type="button"
      className={`${styles['button'] ?? ''} ${control.feature === 'aggregate.run' ? (styles['run'] ?? '') : ''}`}
      data-feature={control.element}
      title={control.tip}
      disabled={control.disabled === true}
      onClick={() => {
        pressControl(collectionRef, control);
      }}
    >
      {control.icon === undefined ? null : <span className={`codicon codicon-${control.icon}`} aria-hidden="true" />}
      <span>{control.label}</span>
    </button>
  );
}

function StageList({
  shown,
  props,
  kept,
}: {
  readonly shown: PipelineEditorView;
  readonly props: PipelinePaneProps;
  readonly kept: PipelineTab;
}) {
  const { collectionRef, collection } = props;
  const output = kept.ran === undefined ? undefined : tableOutput(kept.ran, collection.documents);
  if (shown.empty !== undefined) {
    return (
      <div className={styles['empty']}>
        <p>{shown.empty.text}</p>
        <ControlButton control={shown.empty.add} collectionRef={collectionRef} />
      </div>
    );
  }
  return (
    <ol className={styles['stages']} aria-label={text.editor.list}>
      {shown.cards.map((card) => (
        <li key={card.index} className={styles['stage']}>
          {card.index === 0 ? null : (
            <span className={styles['arrow']} aria-hidden="true">
              {shown.side ? '↓' : '→'}
            </span>
          )}
          <StageCard
            card={card}
            collectionRef={collectionRef}
            kept={kept}
            fields={fieldsForStage(card.index, output, hintsOf(collection))}
            sizes={shown.sizes}
          />
        </li>
      ))}
      {shown.add === undefined ? null : (
        <li className={styles['stage']}>
          <button
            type="button"
            className={styles['add']}
            data-feature={shown.add.element}
            title={shown.add.label}
            aria-label={shown.add.label}
            onClick={() => {
              if (shown.add !== undefined) {
                pressControl(collectionRef, shown.add);
              }
            }}
          >
            <span className={`codicon codicon-${shown.add.icon ?? 'add'}`} aria-hidden="true" />
          </button>
        </li>
      )}
    </ol>
  );
}

function TextPane({
  textView,
  props,
  kept,
}: {
  readonly textView: NonNullable<PipelineEditorView['text']>;
  readonly props: PipelinePaneProps;
  readonly kept: PipelineTab;
}) {
  const { collectionRef, collection } = props;
  return (
    <div className={styles['text']} data-feature="aggregate.autocomplete@editor">
      <MongoshEditor
        label={textView.label}
        field="pipeline-text"
        placeholder={textView.hint}
        text={textView.value}
        kind="pipeline"
        fields={hintsOf(collection)}
        multiline
        invalid={textView.invalid !== undefined}
        {...(kept.focusText === undefined ? {} : { focusRequest: kept.focusText })}
        onChange={(written) => {
          editText(collectionRef, written);
        }}
        onRun={() => {
          runWhole(collectionRef);
        }}
        onNeedFields={() => {
          void readHints(collectionRef);
        }}
      />
    </div>
  );
}

function Toolbar({
  shown,
  collectionRef,
}: {
  readonly shown: PipelineEditorView;
  readonly collectionRef: CollectionRef;
}) {
  const { showFull } = shown.line;
  return (
    <div className={styles['foot']}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.toolbar.name}>
        {shown.toolbarGroups.map((group) => (
          <div key={group[0]?.element ?? ''} className={styles['group']}>
            {group
              .filter((control) => isBuilt(control.element))
              .map((control) => (
                <ControlButton key={control.element} control={control} collectionRef={collectionRef} />
              ))}
          </div>
        ))}
      </div>
      <p className={styles['line']} aria-live="polite">
        {shown.line.text}
        {showFull === undefined ? null : (
          <button
            type="button"
            className={styles['link']}
            data-feature={showFull.element}
            onClick={() => {
              pressControl(collectionRef, showFull);
            }}
          >
            {showFull.label}
          </button>
        )}
      </p>
    </div>
  );
}

/** The pipeline editor. */
export function PipelinePane(props: PipelinePaneProps): React.JSX.Element {
  const { collectionRef } = props;
  const kept = usePipeline(collectionRef.tab);
  const memory = useAppState().tabs.tabs.find((each) => each.id === collectionRef.tab)?.memory?.pipeline;
  useEffect(() => {
    readKept(collectionRef.tab, memory);
  }, [collectionRef.tab, memory]);
  const dragged = useDragged();
  const side = useQueryPlace().side;
  const shown = view({ editor: kept.draft, readOnly: props.readOnly, side });
  return (
    <div
      className={styles['editor']}
      data-side={side}
      role="region"
      aria-label={text.editor.region}
      data-feature="aggregate.show@query-bar"
    >
      {shown.text === undefined ? (
        <StageList shown={shown} props={props} kept={kept} />
      ) : (
        <TextPane textView={shown.text} props={props} kept={kept} />
      )}
      <Toolbar shown={shown} collectionRef={collectionRef} />
      {dragged === undefined ? null : (
        <PipelineDropZones dragged={dragged} editor={kept.draft} collectionRef={collectionRef} />
      )}
    </div>
  );
}
