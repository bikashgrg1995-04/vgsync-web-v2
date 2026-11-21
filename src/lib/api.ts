/**
 * Small fetch wrapper for the VGSync API.
 *
 * - Sends the access token as a Bearer header.
 * - On a 401 it refreshes the tokens once (a single refresh is shared by all
 *   requests that fail at the same time, because every refresh rotates the
 *   refresh token) and retries the request.
 * - If the refresh fails the session is cleared and the user goes to login.
 * - Turns every error body into an ApiError with a readable message.
 */

import { cacheDropPrefix, cacheRead, cacheWrite, type CacheEntry } from './cache';
import { clearAuth, readAuth, writeAuth } from './session-store';

export const API_BASE = (
  import.meta.env.PUBLIC_API_URL ?? 'http://127.0.0.1:8000/api/v1'
).replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  fields: Record<string, string>;

  constructor(message: string, status: number, code?: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return value == null ? '' : String(value);
}

/** DRF errors come as {detail}, {field: [msgs]}, or a list. */
export function toApiError(status: number, data: unknown): ApiError {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : undefined;
  const fields: Record<string, string> = {};

  for (const [key, val] of Object.entries(body)) {
    if (key !== 'detail' && key !== 'code') fields[key] = flatten(val);
  }

  let message = flatten(body.detail);
  if (!message) message = Object.values(fields).join(' ');
  if (!message && status === 429) message = 'Too many attempts. Please wait a moment and try again.';
  if (!message) message = `Request failed (${status}).`;

  return new ApiError(message, status, code, fields);
}

/** Tells the page whether the server can be reached (the offline bar listens). */
function reach(ok: boolean): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vg:reach', { detail: ok }));
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    reach(true);
    return res;
  } catch {
    reach(false);
    throw new ApiError(NETWORK_MESSAGE, 0, 'network');
  }
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function jsonInit(method: string, body: unknown, token?: string, extra?: Record<string, string>): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  // FormData (file uploads) sets its own multipart boundary header.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  };
}

let refreshing: Promise<boolean> | null = null;

/** Returns true when new tokens were stored, false when the session is over. */
async function refreshTokens(): Promise<boolean> {
  const auth = readAuth();
  if (!auth) return false;

  const res = await send('/auth/token/refresh/', jsonInit('POST', { refresh: auth.refresh }));

  if (!res.ok) {
    // Only a clear rejection ends the session; a server error (5xx) or a
    // throttle (429) must not log people out.
    if (res.status === 401 || res.status === 400 || res.status === 403) {
      clearAuth();
      return false;
    }
    throw toApiError(res.status, await readBody(res));
  }

  const data = (await readBody(res)) as { access: string; refresh?: string };
  // The session may have been replaced (login/logout in another tab).
  const current = readAuth();
  if (!current || current.refresh !== auth.refresh) return !!current;

  writeAuth({ ...current, access: data.access, refresh: data.refresh ?? current.refresh });
  return true;
}

function refreshOnce(): Promise<boolean> {
  refreshing ??= refreshTokens().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function redirectToLogin(reason: 'expired' | 'password-changed' | 'logged-out' = 'expired'): void {
  if (window.location.pathname === '/') return;
  window.location.replace(reason === 'logged-out' ? '/' : `/?notice=${reason}`);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** false for public endpoints (login, forgot/reset password). */
  auth?: boolean;
  /** false to always ask the server (live counters). GET answers are kept on the device by default. */
  cache?: boolean;
}

// ---- Saved answers (stale-while-revalidate) ----------------------------------
//
// A GET is answered from the copy on this device when there is one, and the
// server is asked in the background whether it changed (If-None-Match: when
// nothing changed it replies 304 with no data). Only a real change replaces the
// copy and tells the page to refresh. Any save (POST/PATCH/PUT/DELETE) forgets
// the copies of that person and business, so the next read is always fresh.

/** Answers younger than this are used as they are, without asking the server. */
const FRESH_MS = 20_000;

/** Never kept: sign-in, live counters and files. */
const NOT_CACHED = /^\/(auth|notifications)\b|export|download|template|\.(xlsx|pdf|csv)\b/i;

function cachePrefix(): string | null {
  const a = readAuth();
  return a ? `${a.user.id}:${a.active_business.id}:` : null;
}

const inflight = new Map<string, Promise<void>>();

function revalidate(path: string, key: string, held: CacheEntry): void {
  if (inflight.has(key)) return;
  const job = (async () => {
    try {
      const res = await authedSend(path, 'GET', undefined, held.etag ? { 'If-None-Match': held.etag } : undefined);
      if (res.status === 304) {
        await cacheWrite(key, { ...held, at: Date.now() });
        return;
      }
      if (!res.ok) return; // offline or a server problem: keep showing what we have
      const data = await readBody(res);
      const changed = JSON.stringify(data) !== JSON.stringify(held.data);
      await cacheWrite(key, { data, etag: res.headers.get('ETag'), at: Date.now() });
      if (changed) window.dispatchEvent(new Event('vg:data-changed'));
    } catch {
      /* offline: the saved copy stays */
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
}

async function cachedGet<T>(path: string, prefix: string): Promise<T> {
  const key = prefix + path;
  const held = await cacheRead(key);

  if (held) {
    if (Date.now() - held.at > FRESH_MS) revalidate(path, key, held);
    return held.data as T;
  }

  const res = await authedSend(path, 'GET', undefined);
  const data = await readBody(res);
  failIfNeeded(res, data);
  void cacheWrite(key, { data, etag: res.headers.get('ETag'), at: Date.now() });
  return data as T;
}

/** Sends the request with the Bearer token, refreshing it once on a 401. */
async function authedSend(path: string, method: string, body: unknown, extra?: Record<string, string>): Promise<Response> {
  const first = readAuth();
  if (!first) {
    redirectToLogin();
    throw new ApiError('Please sign in.', 401);
  }

  let res = await send(path, jsonInit(method, body, first.access, extra));

  if (res.status === 401) {
    const ok = await refreshOnce();
    const next = ok ? readAuth() : null;
    if (!next) {
      redirectToLogin();
      throw new ApiError('Your session has expired. Please sign in again.', 401);
    }
    res = await send(path, jsonInit(method, body, next.access, extra));
  }

  return res;
}

function failIfNeeded(res: Response, data: unknown): void {
  if (res.ok) return;

  const error = toApiError(res.status, data);

  if (
    error.code === 'password_change_required' &&
    window.location.pathname.replace(/\/+$/, '') !== '/change-password'
  ) {
    window.location.replace('/change-password');
  }

  throw error;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = options.body === undefined ? 'GET' : 'POST', body, auth = true } = options;

  const prefix = auth ? cachePrefix() : null;
  if (method === 'GET' && prefix && options.cache !== false && !NOT_CACHED.test(path)) {
    return cachedGet<T>(path, prefix);
  }

  // Saving needs the server (invoice numbers, stock and approvals are decided there).
  if (method !== 'GET' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    reach(false);
    throw new ApiError("You're offline. Saving is turned off until you're back online.", 0, 'offline');
  }

  const res = auth ? await authedSend(path, method, body) : await send(path, jsonInit(method, body));
  const data = await readBody(res);

  failIfNeeded(res, data);
  // A save changes what other pages show (stock, balances, dashboard): forget the saved copies.
  if (method !== 'GET' && prefix) await cacheDropPrefix(prefix);
  return data as T;
}

/** Downloads a file (Excel/PDF export) and hands it to the browser as a save. */
export async function apiDownload(path: string, fallbackName: string, method = 'GET'): Promise<void> {
  const res = await authedSend(path, method, undefined);

  if (!res.ok) {
    failIfNeeded(res, await readBody(res));
    return;
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
