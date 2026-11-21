/**
 * The search index dialog (`index.search-dialog`, `@dialog`) that `index.create-search` and `index.edit-search` ask
 * through: the form, **Definition** in mongosh syntax, **Command**, the notes and the error, then **Copy command**,
 * **Cancel** and **Create search index** or **Save changes** (`Ctrl+Enter`). Once answered it stays drawn, locked,
 * until its plan ends (`dialog-memory`).
 */
import { useEffect, useState } from 'react';
import type { SearchDialogAbout } from '../../../features/index/parts/dialog-question';
import { typedInput } from '../../../features/index/parts/typed-input';
import {
  openSearchDialog,
  searchDialogAnswers,
  view,
  withDefinitionTyped,
  withFields,
  type SearchDialogState,
} from '../../../features/index/search-dialog';
import { text } from '../../../features/index/text';
import type { SampledField, SearchIndexList } from '../../../features/index/types';
import type { FieldHint } from '../../../features/query/field-hints';
import type { Answers } from '../../../shared/feature';
import { connectionId } from '../../../shared/ids';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { closeAnswered, dialogAnswered, dialogKey, reopeningOf, type DialogWhere } from './dialog-memory';
import { readFieldHints } from './field-hints';
import { NameAndType, SearchPart, VectorPart, type SearchPartProps } from './search-dialog-form';
import styles from './index.module.css';

function sampled(hints: readonly FieldHint[]): readonly SampledField[] {
  return hints.map((hint) => ({
    path: hint.path,
    types: hint.types,
    ratio: hint.ratio,
    ...(hint.vector === undefined ? {} : { vector: hint.vector }),
  }));
}

async function readSearchList(where: DialogWhere): Promise<SearchIndexList | undefined> {
  const result = await window.datardo.start({
    feature: 'index.list-search' as never,
    target: { kind: 'collection', ...where, connection: connectionId(where.connection) },
    args: { ...where },
  });
  return result.kind === 'read' ? (result.result as SearchIndexList) : undefined;
}

/** The sample and the search indexes, read once the dialog opens; a dialog opened again has them already. */
function useSearchReads(
  where: DialogWhere,
  state: SearchDialogState,
  change: (update: (current: SearchDialogState) => SearchDialogState) => void,
): void {
  const [asked] = useState(() => state.fields === undefined);
  const { connection, database, collection } = where;
  useEffect(() => {
    if (!asked) {
      return undefined;
    }
    let live = true;
    const place = { connection, database, collection };
    void Promise.all([readFieldHints(place), readSearchList(place)]).then(([hints, list]) => {
      if (live) {
        change((current) => ({
          ...withFields(current, sampled(hints)),
          ...(list === undefined ? {} : { searchIndexes: list }),
        }));
      }
    });
    return () => {
      live = false;
    };
    // Read once: the state given is the one the dialog opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, connection, database, collection]);
}

interface FrameProps {
  readonly state: SearchDialogState;
  readonly locked: boolean;
  readonly change: (state: SearchDialogState) => void;
  readonly save: () => void;
  readonly cancel: () => void;
}

function Lines({ shown }: { readonly shown: ReturnType<typeof view> }): React.JSX.Element {
  return (
    <>
      <div className={styles['option']}>
        <span>{text.searchDialog.command}</span>
        <pre className={styles['command']}>{shown.command}</pre>
      </div>
      {shown.notes.map((note) => (
        <p key={note} className={styles['note']} role="status">
          {note}
        </p>
      ))}
      {shown.error === undefined ? null : (
        <p className={styles['dialog-problem']} role="alert">
          {shown.error}
        </p>
      )}
    </>
  );
}

function SearchDialogFrame(props: FrameProps): React.JSX.Element {
  const shown = view(props.state);
  const part: SearchPartProps = { state: props.state, shown, locked: props.locked, change: props.change };
  return (
    <Dialog
      title={shown.title}
      kind="form"
      onCancel={props.cancel}
      buttons={
        <>
          <DialogButton
            onClick={() => {
              void navigator.clipboard.writeText(shown.command);
            }}
          >
            {text.searchDialog.copy}
          </DialogButton>
          <DialogButton onClick={props.cancel}>{text.searchDialog.cancel}</DialogButton>
          <DialogButton
            feature="index.search-dialog@dialog"
            look="primary"
            disabled={!shown.button.enabled}
            onClick={props.save}
          >
            {shown.button.label}
          </DialogButton>
        </>
      }
    >
      <div
        className={styles['dialog']}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            props.save();
          }
        }}
      >
        <NameAndType {...part} />
        {props.state.type === 'search' ? <SearchPart {...part} /> : <VectorPart {...part} />}
        <div className={styles['option']}>
          <span>{text.searchDialog.definition}</span>
          <MongoshEditor
            label={text.searchDialog.definition}
            field="definition"
            placeholder=""
            text={shown.definition}
            kind={props.state.type === 'search' ? 'searchDefinition' : 'vectorDefinition'}
            fields={[]}
            multiline
            maxHeight={200}
            invalid={props.state.definition.parsed.kind === 'invalid'}
            readOnly={props.locked}
            onChange={(typed) => {
              props.change(withDefinitionTyped(props.state, typedInput(typed, Date.now())));
            }}
            onRun={props.save}
          />
        </div>
        <Lines shown={shown} />
      </div>
    </Dialog>
  );
}

function searchKey(about: SearchDialogAbout): string {
  const { connection, database, collection } = about;
  return dialogKey({ connection, database, collection, ...(about.editing ? { editing: about.editing.name } : {}) });
}

function opened(about: SearchDialogAbout): SearchDialogState {
  return (
    reopeningOf('search', searchKey(about)) ??
    openSearchDialog({ collection: about.collection, ...(about.editing ? { editing: about.editing } : {}) })
  );
}

/** The search index dialog of a question the runner asks. */
export function SearchQuestionDialog({
  about,
  onAnswer,
}: {
  readonly about: SearchDialogAbout;
  readonly onAnswer: (answers: Answers | undefined) => void;
}): React.JSX.Element {
  const [state, setState] = useState(() => opened(about));
  const where = { connection: about.connection, database: about.database, collection: about.collection };
  useSearchReads(where, state, setState);
  const save = (): void => {
    if (!view(state).button.enabled) {
      return;
    }
    const { error: _error, ...rest } = state;
    const key = searchKey(about);
    dialogAnswered({ kind: 'search', key, where, state: { ...rest, busy: true } });
    onAnswer(searchDialogAnswers(state));
  };
  return (
    <SearchDialogFrame
      state={state}
      locked={false}
      change={setState}
      save={save}
      cancel={() => {
        onAnswer(undefined);
      }}
    />
  );
}

/** The search index dialog answered, while its plan runs. */
export function AnsweredSearchDialog({ state }: { readonly state: SearchDialogState }): React.JSX.Element {
  return (
    <SearchDialogFrame state={state} locked change={() => undefined} save={() => undefined} cancel={closeAnswered} />
  );
}
