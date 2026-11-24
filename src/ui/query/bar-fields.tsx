/**
 * The five fields of the query bar (`query.bar`): **Filter**, **Sort** and **Project** are Datardo's editor of mongosh
 * text (`query.highlight`, `query.autocomplete`); **Skip** and **Limit** take digits only. `Ctrl+Enter` runs the
 * query from any of them, `Enter` from all but **Filter**. While something of the table is dragged, the zones of
 * `query.drag` cover **Filter**, **Sort** and **Project**; in the query pane those over **Filter** go two by two.
 */
import { filterMostHeight, type BarField } from '../../features/query/bar';
import type { DragView, Dragged } from '../../features/query/drag';
import type { FieldHint } from '../../features/query/field-hints';
import { MongoshEditor } from '../components/editor/mongosh-editor';
import { editField, runFromBar } from './bar-actions';
import { readHints, type CollectionRef } from './collection-reads';
import type { CollectionTab } from './collection-store';
import { DropZones } from './drop-zones';
import styles from './query-bar.module.css';

/** What the fields are drawn with. */
export interface FieldsInput {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly fields: readonly BarField[];
  readonly dragged?: { readonly what: Dragged; readonly zones: DragView };
  /** What `Enter` and `Ctrl+Enter` start in place of the query. */
  readonly run?: () => void;
}

function runOf(input: FieldsInput): () => void {
  return (
    input.run ??
    (() => {
      runFromBar(input.collectionRef);
    })
  );
}

function DigitsField({ field, input }: { readonly field: BarField; readonly input: FieldsInput }) {
  const { collectionRef } = input;
  return (
    <input
      className={styles['digits']}
      type="text"
      inputMode="numeric"
      aria-label={field.label}
      placeholder={field.placeholder}
      value={field.text}
      aria-invalid={field.invalid ? true : undefined}
      data-field={field.field}
      onChange={(event) => {
        editField(collectionRef, field.field, event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          runOf(input)();
        }
      }}
    />
  );
}

function hintsOf(collection: CollectionTab): readonly FieldHint[] {
  return collection.hints.kind === 'read' ? collection.hints.fields : [];
}

function TextField({ field, input }: { readonly field: BarField; readonly input: FieldsInput }): React.JSX.Element {
  const { collectionRef, collection } = input;
  const kind = field.field === 'sort' ? 'sort' : field.field === 'project' ? 'project' : 'filter';
  const flash = collection.flash?.field === field.field ? collection.flash.at : undefined;
  return (
    <MongoshEditor
      label={field.label}
      field={field.field}
      placeholder={field.placeholder}
      text={field.text}
      kind={kind}
      fields={hintsOf(collection)}
      multiline={field.multiline}
      {...(field.multiline ? { maxHeight: filterMostHeight } : {})}
      invalid={field.invalid}
      {...(flash === undefined ? {} : { flash })}
      {...(field.field === 'filter' ? { focusRequest: collection.focusFilter } : {})}
      onChange={(written) => {
        editField(collectionRef, field.field, written);
      }}
      onRun={runOf(input)}
      onNeedFields={() => {
        void readHints(collectionRef);
      }}
    />
  );
}

function zonesOf(field: BarField, dragged: FieldsInput['dragged']) {
  if (dragged === undefined || field.digitsOnly) {
    return undefined;
  }
  const zones = field.field === 'sort' ? dragged.zones.sort : field.field === 'project' ? dragged.zones.project : [];
  return field.field === 'filter' ? dragged.zones.filter : zones;
}

/**
 * The fields, each in its box, with the zones over it while something is dragged. Its label, which a screen reader
 * already has from the box, is shown above the box in the query pane only.
 */
export function BarFields({ input }: { readonly input: FieldsInput }): React.JSX.Element {
  return (
    <>
      {input.fields.map((field) => {
        const zones = zonesOf(field, input.dragged);
        return (
          <div key={field.field} className={styles['field']} data-field={field.field}>
            <span className={styles['label']} aria-hidden="true">
              {field.label}
            </span>
            <div className={styles['box']}>
              {field.digitsOnly ? (
                <DigitsField field={field} input={input} />
              ) : (
                <TextField field={field} input={input} />
              )}
              {zones === undefined || input.dragged === undefined ? null : (
                <DropZones zones={zones} dragged={input.dragged.what} collectionRef={input.collectionRef} />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
