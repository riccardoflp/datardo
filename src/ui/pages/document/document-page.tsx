/**
 * The document tab (`document.open`): its toolbar (**Save** or **Insert**, **Revert**, **Copy as**, the **Read-only**
 * mark and the line of `undo.note`) and the document in Datardo's editor, or **Loading…**, the document gone, or the
 * server's error with **Retry**. `Ctrl+S` in the editor saves (`document.save@editor`), or inserts a new document
 * (`document.insert-from-tab@editor`). The connection is read as it is now, so making it read-only shows at once.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect } from 'react';
import { view, type DocumentTabView } from '../../../features/document/open';
import { text } from '../../../features/document/text';
import { keptCollection } from '../../../features/document/types';
import { undoNoteOf } from '../../../features/document/write/undo-note';
import { formatsFor } from '../../../features/table/copy-as';
import type { Json } from '../../../shared/engine-request';
import type { Place, TabId } from '../../../shared/ids';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { useAppState } from '../../state/store';
import { placeOfCollection } from './document-actions';
import {
  copyTabDocument,
  insertFromTab,
  keepChanges,
  openTabDocument,
  readTabDocument,
  revertTab,
  saveTab,
  typeInTab,
  type DocumentShows,
} from './document-tab-actions';
import { useTabDocument, type TabDocument } from './document-tab-store';
import styles from './document.module.css';

interface PageProps {
  readonly tab: TabId;
  readonly shows: DocumentShows;
}

function useTabView(props: PageProps, kept: TabDocument | undefined): DocumentTabView | undefined {
  const state = useAppState();
  if (kept === undefined) {
    return undefined;
  }
  const place = placeOfCollection(state, props.shows, props.shows.view === true);
  const id = props.shows.newDocument === undefined ? (JSON.parse(props.shows.idJson ?? 'null') as Json) : undefined;
  const ids = id === undefined || id === null ? [] : [id];
  const note = undoNoteOf(place, state.settings, { kind: 'ids', ...keptCollection(place), ids, count: 1 });
  return view({
    place,
    ...(id === undefined || id === null ? {} : { id }),
    ...(props.shows.newDocument === undefined ? {} : { number: props.shows.newDocument }),
    load: kept.load,
    text: kept.text,
    loadedText: kept.loadedText,
    undoOff: !note.recorded,
  });
}

function save(props: PageProps, shown: DocumentTabView, place: Place): void {
  if (!shown.save.enabled) {
    return;
  }
  if (props.shows.newDocument === undefined) {
    void saveTab(props.tab, props.shows, place);
  } else {
    void insertFromTab(props.tab, props.shows, place);
  }
}

function CopyAs({ props, document }: { readonly props: PageProps; readonly document: Json | undefined }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild disabled={document === undefined}>
        <button type="button" className={styles['button']}>
          {text.open.copyAs}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={text.open.copyAs} align="start">
          {formatsFor(1).map((each) => (
            <DropdownMenu.Item
              key={each.format}
              className={styles['item']}
              title={each.description}
              onSelect={() => {
                if (document !== undefined) {
                  void copyTabDocument(props.shows, document, each.format);
                }
              }}
            >
              {each.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Toolbar({
  props,
  shown,
  kept,
}: {
  readonly props: PageProps;
  readonly shown: DocumentTabView;
  readonly kept: TabDocument;
}) {
  const loaded = kept.load.kind === 'loaded' ? kept.load.document : undefined;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={shown.title}>
      <button
        type="button"
        className={styles['button']}
        data-feature={shown.save.element}
        disabled={!shown.save.enabled}
        title={`${shown.save.label} (${shown.save.key ?? 'Ctrl+S'})`}
        onClick={() => {
          save(props, shown, 'toolbar');
        }}
      >
        {shown.save.label}
      </button>
      {shown.undoLine === undefined ? null : <span className={styles['note']}>{shown.undoLine}</span>}
      {props.shows.newDocument === undefined ? (
        <button
          type="button"
          className={styles['button']}
          disabled={!shown.revert.enabled}
          onClick={() => {
            revertTab(props.tab, props.shows, false);
          }}
        >
          {shown.revert.label}
        </button>
      ) : null}
      {props.shows.newDocument === undefined ? <CopyAs props={props} document={loaded} /> : null}
      {shown.readOnly === undefined ? null : (
        <span
          className={styles['mark']}
          title={shown.readOnly.tooltip}
          aria-label={`${shown.readOnly.label}: ${shown.readOnly.tooltip}`}
        >
          {shown.readOnly.label}
        </span>
      )}
    </div>
  );
}

function Body({
  props,
  shown,
  kept,
}: {
  readonly props: PageProps;
  readonly shown: DocumentTabView;
  readonly kept: TabDocument;
}) {
  const body = shown.body;
  if (body.kind !== 'editor') {
    return (
      <div className={styles['message']} role="status">
        <p className={body.kind === 'error' ? styles['problem'] : undefined}>{body.text}</p>
        {body.kind === 'error' ? (
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              void readTabDocument(props.tab, props.shows);
            }}
          >
            {body.retry}
          </button>
        ) : null}
      </div>
    );
  }
  const element = props.shows.newDocument === undefined ? 'document.save@editor' : 'document.insert-from-tab@editor';
  return (
    <div
      className={styles['page-body']}
      data-feature={element}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          save(props, shown, 'editor');
        }
      }}
    >
      <MongoshEditor
        label={shown.title}
        field="document"
        placeholder=""
        text={body.text}
        kind="document"
        fields={[]}
        multiline
        invalid={kept.problem !== undefined}
        readOnly={!body.editable}
        onChange={(typed) => {
          typeInTab(props.tab, typed);
        }}
        onRun={() => {
          save(props, shown, 'editor');
        }}
      />
      {kept.problem === undefined ? null : (
        <p className={styles['problem']} role="alert">
          {kept.problem}
        </p>
      )}
    </div>
  );
}

function RevertQuestion({ props, shown }: { readonly props: PageProps; readonly shown: DocumentTabView }) {
  const confirm = shown.revert.confirm;
  if (confirm === undefined) {
    return null;
  }
  const cancel = (): void => {
    keepChanges(props.tab);
  };
  const buttons = (
    <>
      <DialogButton autoFocus onClick={cancel}>
        {text.insert.cancel}
      </DialogButton>
      <DialogButton
        look="danger"
        onClick={() => {
          revertTab(props.tab, props.shows, true);
        }}
      >
        {confirm.button}
      </DialogButton>
    </>
  );
  return (
    <Dialog title={confirm.text} kind="confirm" onCancel={cancel} buttons={buttons}>
      {null}
    </Dialog>
  );
}

/** The page of a document tab. */
export function DocumentPage(props: PageProps): React.JSX.Element | null {
  const state = useAppState();
  const tab = state.tabs.tabs.find((each) => each.id === props.tab);
  useEffect(() => {
    if (tab !== undefined) {
      openTabDocument(tab, props.shows);
    }
  }, [tab, props.shows]);
  const kept = useTabDocument(props.tab);
  const shown = useTabView(props, kept);
  if (kept === undefined || shown === undefined) {
    return null;
  }
  return (
    <div className={styles['page']}>
      <Toolbar props={props} shown={shown} kept={kept} />
      <Body props={props} shown={shown} kept={kept} />
      {kept.confirmRevert ? <RevertQuestion props={props} shown={shown} /> : null}
    </div>
  );
}
