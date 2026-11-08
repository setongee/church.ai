// A tiny key-value store on IndexedDB: the copy of songs, Bibles, schedules and so on that lives on this device.
const DB = "fafc-offline";
const STORE = "kv";

let opened: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opened) return opened;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No local storage on this device."));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  p.catch(() => {
    opened = null; // try again next time
  });
  opened = p;
  return p;
}

const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );

export const idbGet = <T>(key: string): Promise<T | undefined> => run<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined);
export const idbSet = (key: string, value: unknown): Promise<void> => run("readwrite", (s) => s.put(value, key)).then(() => undefined).catch(() => undefined);
export const idbDel = (key: string): Promise<void> => run("readwrite", (s) => s.delete(key)).then(() => undefined).catch(() => undefined);
export const idbKeys = (): Promise<string[]> => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((k) => k.map(String)).catch(() => []);
