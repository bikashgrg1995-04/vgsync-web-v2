/**
 * A small on-device copy of what the API last said (IndexedDB), so pages can
 * show their data at once and ask the server only whether it changed.
 *
 * Saved data is encrypted (AES-GCM) with a key the browser keeps non-extractable
 * in the same database: nothing readable sits on disk, the key cannot be copied
 * out by page code, and sign-out deletes the data and the key together. This is
 * protection for a lost or shared device, not against someone using the signed-in
 * browser itself.
 *
 * Everything is best effort: when IndexedDB or Web Crypto is not available (private
 * windows, blocked storage, plain http) every call quietly does nothing and the
 * app just works online as before.
 */

const DB_NAME = 'vgsync-cache';
const STORE = 'gets';
const KEYS = 'keys';
const KEY_ID = 'k';

export interface CacheEntry {
  data: unknown;
  /** The server's ETag for this data, sent back as If-None-Match. */
  etag: string | null;
  /** When the data was last confirmed current (ms). */
  at: number;
}

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

let opened: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Version 1 kept plain copies; they are not wanted any more.
        if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
        db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | void,
  pick?: (req: IDBRequest) => T,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = work(tx.objectStore(store));
          tx.oncomplete = () => resolve(req && pick ? pick(req) : null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// ---- the key --------------------------------------------------------------

let keyPromise: Promise<CryptoKey | null> | null = null;

/** The saved key, or a new one (with an empty store: nothing can be read without it). */
function theKey(): Promise<CryptoKey | null> {
  keyPromise ??= (async () => {
    try {
      if (!globalThis.crypto?.subtle) return null;
      const have = await run<CryptoKey | undefined>(KEYS, 'readonly', (s) => s.get(KEY_ID), (r) => r.result as CryptoKey | undefined);
      if (have) return have;
      const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await run(STORE, 'readwrite', (s) => s.clear());
      await run(KEYS, 'readwrite', (s) => s.put(fresh, KEY_ID));
      return fresh;
    } catch {
      return null;
    }
  })();
  return keyPromise;
}

async function seal(key: CryptoKey, entry: CacheEntry): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(entry)));
  return { iv, ct };
}

async function unseal(key: CryptoKey, sealed: Sealed): Promise<CacheEntry | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.ct);
    return JSON.parse(new TextDecoder().decode(plain)) as CacheEntry;
  } catch {
    return null; // wrong key or damaged: same as nothing saved
  }
}

// ---- the saved answers --------------------------------------------------------

export async function cacheRead(key: string): Promise<CacheEntry | null> {
  const k = await theKey();
  if (!k) return null;
  const sealed = await run<Sealed | undefined>(STORE, 'readonly', (s) => s.get(key), (r) => r.result as Sealed | undefined);
  return sealed?.ct ? unseal(k, sealed) : null;
}

export async function cacheWrite(key: string, entry: CacheEntry): Promise<unknown> {
  const k = await theKey();
  if (!k) return null;
  try {
    const sealed = await seal(k, entry);
    return run(STORE, 'readwrite', (s) => s.put(sealed, key));
  } catch {
    return null;
  }
}

/** Forget every saved answer whose key starts with `prefix` (one person in one business). */
export function cacheDropPrefix(prefix: string): Promise<unknown> {
  return run(STORE, 'readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '\uffff')));
}

/** Forget everything and the key (sign-out: nothing of the business stays on a shared computer). */
export async function cacheWipe(): Promise<unknown> {
  keyPromise = null;
  await run(STORE, 'readwrite', (s) => s.clear());
  return run(KEYS, 'readwrite', (s) => s.clear());
}
