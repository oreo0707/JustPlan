import type { Note, NoteObject } from "./types";
import {
  isStoredImageReference,
  loadStoredImage,
  storeImageDataUrl,
} from "./image-storage";

const EDITABLE_NOTE_KIND = "just-plan-editable-note";
const EDITABLE_NOTE_VERSION = 1;

export const EDITABLE_NOTE_FILE_EXTENSION = ".justplan-note";

type EditableNoteFile = {
  kind: typeof EDITABLE_NOTE_KIND;
  version: typeof EDITABLE_NOTE_VERSION;
  exported_at: string;
  note: Note;
};

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function getSafeFileName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ") || "Note"
  );
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read image data."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function regenerateObjectIds(objects: NoteObject[]) {
  return objects.map((object) => ({
    ...object,
    id: createId("object"),
  }));
}

async function prepareObjectForExport(object: NoteObject): Promise<NoteObject> {
  if (!object.src || !isStoredImageReference(object.src)) {
    return object;
  }

  const storedImage = await loadStoredImage(object.src);
  if (!storedImage) {
    return object;
  }

  return {
    ...object,
    src: await blobToDataUrl(storedImage),
  };
}

async function prepareObjectForImport(object: NoteObject): Promise<NoteObject> {
  if (!object.src?.startsWith("data:image/")) {
    return object;
  }

  return {
    ...object,
    src: await storeImageDataUrl(object.src),
  };
}

export async function createEditableNoteFile(note: Note) {
  const exportNote: Note = {
    ...structuredClone(note),
    materials: [],
    objects: await Promise.all(note.objects.map(prepareObjectForExport)),
  };

  const fileContent: EditableNoteFile = {
    kind: EDITABLE_NOTE_KIND,
    version: EDITABLE_NOTE_VERSION,
    exported_at: new Date().toISOString(),
    note: exportNote,
  };

  return new File(
    [JSON.stringify(fileContent, null, 2)],
    `${getSafeFileName(note.title)}${EDITABLE_NOTE_FILE_EXTENSION}`,
    { type: "application/json" }
  );
}

export async function importEditableNoteFile(file: File) {
  const rawText = await file.text();
  let parsed: EditableNoteFile;

  try {
    parsed = JSON.parse(rawText) as EditableNoteFile;
  } catch {
    throw new Error("Unable to read this editable note file.");
  }

  if (
    parsed.kind !== EDITABLE_NOTE_KIND ||
    parsed.version !== EDITABLE_NOTE_VERSION ||
    !parsed.note ||
    typeof parsed.note.title !== "string" ||
    !Array.isArray(parsed.note.objects)
  ) {
    throw new Error("This does not look like a Just Plan editable note file.");
  }

  const now = new Date().toISOString();
  const importedObjects = await Promise.all(
    parsed.note.objects.map(prepareObjectForImport)
  );

  return {
    ...parsed.note,
    id: createId("note"),
    objects: regenerateObjectIds(importedObjects),
    materials: [],
    deleted_at: undefined,
    deleted_from_subject_id: undefined,
    deleted_from_subject_name: undefined,
    created_at: now,
    updated_at: now,
  } satisfies Note;
}
