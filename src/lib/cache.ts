/**
 * A small on-device copy of what the API last said (IndexedDB), so pages can
 * show their data at once and ask the server only whether it changed.
 *
 * Everything is best effort: when IndexedDB is not available (private
 * windows, blocked storage) every call quietly does nothing and the app just
 * works online as before.
 */

const DB_NAME = 'vgsync-cache';
const STORE = 'gets';

export interface CacheEntry {
  data: unknown;
  /** The server's ETag for this data, sent back as If-None-Match. */
  etag: string | null;
  /** When the data was last confirmed current (ms). */
  at: number;
}

let opened: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void, pick?: (req: IDBRequest) => T): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = work(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req && pick ? pick(req) : null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function cacheRead(key: string): Promise<CacheEntry | null> {
  return run<CacheEntry | undefined>('readonly', (s) => s.get(key), (r) => r.result as CacheEntry | undefined).then((v) => v ?? null);
}

export function cacheWrite(key: string, entry: CacheEntry): Promise<unknown> {
  return run('readwrite', (s) => s.put(entry, key));
}

/** Forget every saved answer whose key starts with `prefix` (one person in one business). */
export function cacheDropPrefix(prefix: string): Promise<unknown> {
  return run('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿')));
}

/** Forget everything (sign-out: nothing of the business stays on a shared computer). */
export function cacheWipe(): Promise<unknown> {
  return run('readwrite', (s) => s.clear());
}
