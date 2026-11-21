/**
 * `gridfs.inspect`: the selected file in the inspector island, drawn from its View: its name, size, date and type;
 * its buttons; **Edit metadata** (or **Show document**), **Copy _id** and **Copy name**; the preview; and the files
 * document. The preview is read the first time a file is selected and kept until **Refresh** or a change of the
 * bucket. An image, an SVG among them, is drawn by an `<img>` from its bytes: in a picture nothing runs and nothing is
 * loaded (T20).
 */
import { useEffect } from 'react';
import { view, type PreviewView } from '../../../features/gridfs/inspect';
import type { GridControl } from '../../../features/gridfs/types';
import { useAppState } from '../../state/store';
import { startControl } from './gridfs-actions';
import { readPreview } from './gridfs-reads';
import { placeOf, selectedFile } from './gridfs-state';
import { useGridFsTab } from './gridfs-store';
import styles from './gridfs-page.module.css';

function ControlButton({ control }: { readonly control: GridControl }): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      {...(control.kind === 'start' ? { 'data-feature': control.element } : {})}
      title={control.kind === 'start' ? control.tooltip : undefined}
      onClick={() => {
        startControl(control, 'inspector');
      }}
    >
      {control.label}
    </button>
  );
}

function PreviewShown({ preview }: { readonly preview: PreviewView }): React.JSX.Element {
  switch (preview.kind) {
    case 'loading':
      return (
        <p className={styles['note']} role="status" aria-busy="true">
          {preview.text}
        </p>
      );
    case 'image':
      return <img className={styles['picture']} src={preview.source} alt={preview.description} />;
    case 'text':
      return (
        <>
          <pre className={styles['text']} tabIndex={0}>
            {preview.text}
          </pre>
          {preview.note === undefined ? null : <p className={styles['note']}>{preview.note}</p>}
        </>
      );
    case 'binary':
      return (
        <>
          <p className={styles['note']}>{preview.title}</p>
          <pre className={styles['text']} tabIndex={0}>
            {preview.hex}
          </pre>
        </>
      );
    case 'message':
      return <p className={styles['note']}>{preview.text}</p>;
  }
}

/** The inspector island of a tab of a bucket with one file selected. */
export function GridFsInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useGridFsTab(tabId);
  const file = tab === undefined ? undefined : selectedFile(tab);
  const known = file === undefined || tab === undefined ? true : tab.previews.has(file.idText);
  useEffect(() => {
    if (file !== undefined && !known) {
      void readPreview(tabId, file);
    }
  }, [tabId, file, known]);
  if (tab === undefined || file === undefined) {
    return null;
  }
  const preview = tab.previews.get(file.idText);
  const shown = view({ place: placeOf(app, tab.place), file, ...(preview === undefined ? {} : { preview }) });
  return (
    <div className={styles['inspected']} data-feature="gridfs.inspect@inspector">
      <div className={styles['name']}>{shown.heading}</div>
      <p className={styles['facts']}>{shown.facts.join(' · ')}</p>
      <div className={styles['buttons']}>
        {shown.buttons.map((control) => (
          <ControlButton key={control.label} control={control} />
        ))}
      </div>
      <div className={styles['buttons']}>
        {[shown.document, ...shown.copies].map((control) => (
          <ControlButton key={control.label} control={control} />
        ))}
      </div>
      <PreviewShown preview={shown.preview} />
      <p className={styles['label']}>{shown.filesDocument.label}</p>
      <pre className={styles['text']} tabIndex={0}>
        {shown.filesDocument.text}
      </pre>
    </div>
  );
}
