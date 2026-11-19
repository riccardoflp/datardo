/**
 * The file steps the runner carries out: a file the user chose, written with the content its writer builds. The
 * writers run in the main process, so what they read (the passwords of an export) never reaches the window.
 */
import { access, mkdir, rename, rm } from 'node:fs/promises';
import type { FileStep } from '../shared/feature';
import type { Json } from '../shared/engine-request';
import type { FileWriter } from '../runner/ports';
import { connectionsToText, type ExportFormat, type ExportSecrets } from '../features/connection/write-file';
import { fileOfConnection, isFileProblem, jsonFields } from '../features/connection/types';
import { transferText } from '../features/connection/text';
import { writeAtomically } from '../storage/store';
import { fullConnectionString, savedConnections, savedOptionSecrets } from './connections';
import { nodeFileCrypto } from './file-crypto';

const formats: readonly ExportFormat[] = ['datardo', 'compass', 'list'];
const modes: readonly ExportSecrets[] = ['remove', 'include', 'encrypt'];

/** `connection.write-file` `{ ids, format, secrets, passphrase }`: the connections as a file of connections. */
async function connectionsFile(args: Json): Promise<string> {
  const fields = jsonFields(args);
  const ids = Array.isArray(fields['ids']) ? fields['ids'].filter((each) => typeof each === 'string') : [];
  const format = formats.find((each) => each === fields['format']) ?? 'datardo';
  const secrets = modes.find((each) => each === fields['secrets']) ?? 'remove';
  const passphrase = typeof fields['passphrase'] === 'string' ? fields['passphrase'] : '';
  const chosen = savedConnections().filter((each) => ids.includes(each.id));
  const connections = chosen.map((each) =>
    fileOfConnection(each, fullConnectionString(each.id) ?? '', savedOptionSecrets(each.id)),
  );
  const written = await connectionsToText(connections, { format, secrets, passphrase }, nodeFileCrypto);
  if (isFileProblem(written)) {
    throw new Error(transferText.couldNotExport(written.problem));
  }
  return written.text;
}

/** The writers of the content of a file, by name. */
const writers: Readonly<Record<string, (args: Json) => Promise<string>>> = {
  'connection.write-file': connectionsFile,
};

/** Carries out a file step: writes, deletes or creates the folder at its path. */
export const fileWriter: FileWriter = async (step: FileStep) => {
  switch (step.action) {
    case 'delete':
      await rm(step.path, { force: true });
      return;
    case 'create-folder':
      await mkdir(step.path, { recursive: true });
      return;
    case 'rename': {
      // `content.args.to` is the new path; a file already there is never replaced.
      const to = step.content === undefined ? undefined : jsonFields(step.content.args)['to'];
      if (typeof to !== 'string' || to === '') {
        throw new Error(`Datardo has no new name for ${step.path}.`);
      }
      const taken = await access(to).then(
        () => true,
        () => false,
      );
      if (taken) {
        throw new Error(`${to} already exists.`);
      }
      await rename(step.path, to);
      return;
    }
    case 'write': {
      const content = step.content;
      const writer = content === undefined ? undefined : writers[content.writer];
      if (content === undefined || writer === undefined) {
        throw new Error(`Datardo has no writer for ${step.path}.`);
      }
      await writeAtomically(step.path, await writer(content.args));
    }
  }
};
