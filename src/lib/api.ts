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

import { clearAuth, readAuth, writeAuth } from './session-store';

export const API_BASE = (
  import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'
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

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
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

function jsonInit(method: string, body: unknown, token?: string): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
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
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = options.body === undefined ? 'GET' : 'POST', body, auth = true } = options;

  let res: Response;

  if (!auth) {
    res = await send(path, jsonInit(method, body));
  } else {
    const first = readAuth();
    if (!first) {
      redirectToLogin();
      throw new ApiError('Please sign in.', 401);
    }

    res = await send(path, jsonInit(method, body, first.access));

    if (res.status === 401) {
      const ok = await refreshOnce();
      const next = ok ? readAuth() : null;
      if (!next) {
        redirectToLogin();
        throw new ApiError('Your session has expired. Please sign in again.', 401);
      }
      res = await send(path, jsonInit(method, body, next.access));
    }
  }

  const data = await readBody(res);

  if (!res.ok) {
    const error = toApiError(res.status, data);

    if (
      error.code === 'password_change_required' &&
      window.location.pathname !== '/dashboard/change-password'
    ) {
      window.location.replace('/dashboard/change-password');
    }

    throw error;
  }

  return data as T;
}
