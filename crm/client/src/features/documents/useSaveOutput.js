import { useDocumentMutations } from '../../hooks/useDocuments.js';
import useNotify from '../../hooks/useNotify.js';

// Saving what the editors and converters make, as the API's documents:
//  - asVersion: a new version of `document` (the file it replaces is kept)
//  - asNew: a new document of the same record, of the same type
//  - asNewMany: several at once (split, extract)
export default function useSaveOutput(document) {
  const notify = useNotify();
  const { saveVersion, upload } = useDocumentMutations();
  const fileOf = (bytes, fileName, type) => new File([bytes], fileName, { type });

  async function asVersion(bytes, { fileName, note, type = document.fileType }) {
    const response = await saveVersion.mutateAsync({ id: document.id, file: fileOf(bytes, fileName, type), fileName, note });
    notify.success(`Saved as version ${response.data.document.version}`);
    return response.data.document;
  }

  async function asNewMany(files) {
    const response = await upload.mutateAsync({
      entityType: document.entityType,
      entityId: document.entityId,
      files: files.map(({ bytes, fileName, type }) => fileOf(bytes, fileName, type)),
      documentTypeId: document.documentType?.id,
    });
    return response.data.documents;
  }

  async function asNew(bytes, fileName, type) {
    const [created] = await asNewMany([{ bytes, fileName, type }]);
    notify.success(`${created.fileName} saved to ${document.relatedLabel || document.entity?.label || 'the same record'}`);
    return created;
  }

  return { asVersion, asNew, asNewMany };
}
