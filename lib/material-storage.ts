const DATABASE_NAME = "just-study-materials";
const STORE_NAME = "materials";
const REFERENCE_PREFIX = "indexeddb-material:";

function openMaterialDatabase() {
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

function getMaterialId(reference: string) {
  return reference.startsWith(REFERENCE_PREFIX)
    ? reference.slice(REFERENCE_PREFIX.length)
    : null;
}

export async function storeMaterialFile(file: File) {
  const database = await openMaterialDatabase();
  const id = crypto.randomUUID();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
  return `${REFERENCE_PREFIX}${id}`;
}

export async function loadStoredMaterial(reference: string) {
  const id = getMaterialId(reference);
  if (!id) return null;

  const database = await openMaterialDatabase();
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

export async function deleteStoredMaterial(reference: string) {
  const id = getMaterialId(reference);
  if (!id) return;

  const database = await openMaterialDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function clearStoredMaterials() {
  indexedDB.deleteDatabase(DATABASE_NAME);
}
