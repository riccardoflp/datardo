/**
 * The Definition section of a view's tab (`manage.definition`) and the Validation section of a collection's tab
 * (`manage.validation`): the toolbar (**Save** with `Ctrl+S`, **Discard changes**, **Reload**), the note of rules
 * generated, the editor in mongosh syntax, and under it the message of the save refused last. The options are read
 * when the section is first shown; the sample of a collection without rules once they say it has none.
 */
import { useEffect } from 'react';
import type { SectionView } from '../../../features/manage/definition';
import { text } from '../../../features/manage/text';
import type { Place } from '../../../shared/ids';
import { MongoshEditor } from '../../components/editor/mongosh-editor';
import { Dialog, DialogButton } from '../../shell/dialog';
import { useAppState } from '../../state/store';
import {
  discardSection,
  keepSectionChanges,
  readSample,
  readSection,
  reloadSection,
  saveSection,
  typeInSection,
  type SectionKind,
  type SectionPlace,
} from './section-actions';
import { useSection } from './section-store';
import { isSectionReadOnly, sectionView } from './section-view';
import styles from './manage.module.css';

interface SectionProps {
  readonly place: SectionPlace;
  readonly kind: SectionKind;
}

function save(props: SectionProps, shown: SectionView, from: Place): void {
  if (shown.toolbar.save?.enabled === true && shown.editor !== undefined) {
    void saveSection(props.place, props.kind, shown.editor.text, from);
  }
}

function Toolbar({ props, shown }: { readonly props: SectionProps; readonly shown: SectionView }) {
  const { save: saving, discard, reload } = shown.toolbar;
  const label = props.kind === 'definition' ? text.sections.definition : text.sections.validation;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={label}>
      {saving === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={saving.element}
          disabled={!saving.enabled}
          title={`${saving.label} (${saving.key})`}
          onClick={() => {
            save(props, shown, 'toolbar');
          }}
        >
          {saving.label}
        </button>
      )}
      {discard === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          disabled={!discard.enabled}
          onClick={() => {
            discardSection(props.place.tab);
          }}
        >
          {discard.label}
        </button>
      )}
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          reloadSection(props.place, reload.confirm !== undefined);
        }}
      >
        {reload.label}
      </button>
    </div>
  );
}

function ReloadQuestion({ props, shown }: { readonly props: SectionProps; readonly shown: SectionView }) {
  const confirm = shown.toolbar.reload.confirm;
  if (confirm === undefined) {
    return null;
  }
  const cancel = (): void => {
    keepSectionChanges(props.place.tab);
  };
  const buttons = (
    <>
      <DialogButton autoFocus onClick={cancel}>
        {text.sections.cancel}
      </DialogButton>
      <DialogButton
        look="danger"
        onClick={() => {
          void readSection(props.place, true);
        }}
      >
        {confirm.button}
      </DialogButton>
    </>
  );
  return (
    <Dialog title={confirm.title} kind="confirm" onCancel={cancel} buttons={buttons}>
      {null}
    </Dialog>
  );
}

function Body({ props, shown }: { readonly props: SectionProps; readonly shown: SectionView }) {
  const editor = shown.editor;
  if (shown.state !== 'ready' || editor === undefined) {
    return (
      <div className={styles['message']} role="status">
        <p className={shown.state === 'error' ? styles['problem'] : undefined}>{shown.message}</p>
      </div>
    );
  }
  const label = props.kind === 'definition' ? text.sections.definition : text.sections.validation;
  return (
    <div
      className={styles['body']}
      {...(editor.save === undefined ? {} : { 'data-feature': editor.save })}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          save(props, shown, 'editor');
        }
      }}
    >
      {shown.note === undefined ? null : <p className={styles['note']}>{shown.note}</p>}
      <MongoshEditor
        label={label}
        field={props.kind}
        placeholder=""
        text={editor.text}
        kind="document"
        fields={[]}
        multiline
        invalid={shown.refused !== undefined}
        readOnly={editor.readOnly}
        onChange={(typed) => {
          typeInSection(props.place.tab, typed);
        }}
        onRun={() => {
          save(props, shown, 'editor');
        }}
      />
      {shown.refused === undefined ? null : (
        <p className={styles['problem']} role="alert">
          {shown.refused}
        </p>
      )}
    </div>
  );
}

/** The Definition or the Validation section of a tab. */
export function EditorSection(props: SectionProps): React.JSX.Element {
  const state = useAppState();
  const memory = useSection(props.place.tab);
  const readOnly = isSectionReadOnly(state, props.place);
  const shown = sectionView(props.kind, props.place, readOnly, memory);
  const { place } = props;
  useEffect(() => {
    if (!memory.asked) {
      void readSection(place, false);
    }
  }, [memory.asked, place]);
  const sampling = shown.readSample === true;
  useEffect(() => {
    if (sampling) {
      void readSample(place);
    }
  }, [sampling, place]);
  return (
    <div className={styles['section']} data-section={props.kind}>
      <Toolbar props={props} shown={shown} />
      <Body props={props} shown={shown} />
      {memory.confirmReload ? <ReloadQuestion props={props} shown={shown} /> : null}
    </div>
  );
}
