const DATABASE_NAME = "just-study-media";
const STORE_NAME = "images";
const REFERENCE_PREFIX = "indexeddb-image:";

function openImageDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getImageId(reference: string) {
  return reference.startsWith(REFERENCE_PREFIX)
    ? reference.slice(REFERENCE_PREFIX.length)
    : null;
}

export function isStoredImageReference(src: string) {
  return src.startsWith(REFERENCE_PREFIX);
}

export async function storeImageDataUrl(dataUrl: string) {
  const database = await openImageDatabase();
  const id = crypto.randomUUID();
  const blob = await fetch(dataUrl).then((response) => response.blob());

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
  return `${REFERENCE_PREFIX}${id}`;
}

export async function duplicateStoredImage(reference: string) {
  const blob = await loadStoredImage(reference);
  if (!blob) return reference;

  const database = await openImageDatabase();
  const id = crypto.randomUUID();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
  return `${REFERENCE_PREFIX}${id}`;
}

export async function loadStoredImage(reference: string) {
  const id = getImageId(reference);
  if (!id) return null;

  const database = await openImageDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });

  database.close();
  return blob ?? null;
}

export async function deleteStoredImage(reference: string) {
  const id = getImageId(reference);
  if (!id) return;

  const database = await openImageDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function clearStoredImages() {
  indexedDB.deleteDatabase(DATABASE_NAME);
}
