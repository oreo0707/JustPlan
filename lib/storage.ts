import type { AppData } from "./types";
import { defaultData } from "./default-data";
import { clearStoredImages } from "./image-storage";
import { clearStoredMaterials } from "./material-storage";

const STORAGE_KEY = "just-study-data";

export function loadData(): AppData {
  if (typeof window === "undefined") {
    return defaultData;
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return defaultData;
  }

  try {
    const parsed = JSON.parse(raw) as AppData;

    return {
      ...defaultData,
      ...parsed,
      settings: {
        ...defaultData.settings,
        ...parsed.settings,
      },
      recently_deleted: {
        ...defaultData.recently_deleted,
        ...parsed.recently_deleted,
      },
    };
  } catch {
    return defaultData;
  }
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      console.error(
        "Study data could not be saved because browser storage is full."
      );
      return false;
    }

    throw error;
  }
}

export function clearData() {
  localStorage.removeItem(STORAGE_KEY);
  clearStoredImages();
  clearStoredMaterials();
}

export function exportDataFile(data: AppData) {
  const fileContent = JSON.stringify(data, null, 2);

  const blob = new Blob([fileContent], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().split("T")[0];

  const link = document.createElement("a");
  link.href = url;
  link.download = `just-plan-backup-${date}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function importDataFile(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = reader.result;

        if (typeof result !== "string") {
          reject(new Error("Invalid backup file."));
          return;
        }

        const parsed = JSON.parse(result) as AppData;

        if (!parsed.subjects || !parsed.settings) {
          reject(new Error("This does not look like a Just Plan backup file."));
          return;
        }

        resolve(parsed);
      } catch {
        reject(new Error("Unable to read backup file."));
      }
    };

    reader.onerror = () => {
      reject(new Error("Unable to read backup file."));
    };

    reader.readAsText(file);
  });
}
