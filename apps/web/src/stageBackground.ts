export type StageBackgroundKind = "default" | "aurora" | "studio" | "local";
export type StageBackgroundFit = "cover" | "contain";

export type StageBackgroundSettings = {
  kind: StageBackgroundKind;
  fit: StageBackgroundFit;
};

export const STAGE_BACKGROUND_STORAGE_KEY = "ai-vtuber.stageBackground";
export const STAGE_BACKGROUND_DATABASE = "ai-vtuber-stage";
export const STAGE_BACKGROUND_STORE = "backgrounds";
export const STAGE_BACKGROUND_RECORD_KEY = "active";
export const MAX_STAGE_BACKGROUND_BYTES = 8 * 1024 * 1024;

const DEFAULT_SETTINGS: StageBackgroundSettings = { kind: "default", fit: "cover" };

export function readStageBackgroundSettings(): StageBackgroundSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(window.localStorage.getItem(STAGE_BACKGROUND_STORAGE_KEY) ?? "{}") as Partial<StageBackgroundSettings>;
    return {
      kind: value.kind === "aurora" || value.kind === "studio" || value.kind === "local" ? value.kind : "default",
      fit: value.fit === "contain" ? "contain" : "cover",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeStageBackgroundSettings(settings: StageBackgroundSettings): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STAGE_BACKGROUND_STORAGE_KEY, JSON.stringify(settings));
  }
}

export function validateStageBackgroundFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose an image file.";
  if (file.size > MAX_STAGE_BACKGROUND_BYTES) return "Image must be 8 MB or smaller.";
  return null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(STAGE_BACKGROUND_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STAGE_BACKGROUND_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open background storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STAGE_BACKGROUND_STORE, mode).objectStore(STAGE_BACKGROUND_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Background storage request failed."));
    });
  } finally {
    database.close();
  }
}

export function readLocalStageBackground(): Promise<Blob | undefined> {
  return withStore<Blob | undefined>("readonly", (store) => store.get(STAGE_BACKGROUND_RECORD_KEY));
}

export function saveLocalStageBackground(file: File): Promise<IDBValidKey> {
  return withStore<IDBValidKey>("readwrite", (store) => store.put(file, STAGE_BACKGROUND_RECORD_KEY));
}

export function clearLocalStageBackground(): Promise<undefined> {
  return withStore<undefined>("readwrite", (store) => store.delete(STAGE_BACKGROUND_RECORD_KEY));
}

export function getBundledStageBackground(kind: Exclude<StageBackgroundKind, "local">): string | null {
  if (kind === "aurora") return "/backgrounds/stage-aurora.svg";
  if (kind === "studio") return "/backgrounds/stage-studio.svg";
  return null;
}
