// Browser calls stay same-origin and use Next's rewrite, avoiding a CORS
// preflight on every navigation. Server-side callers retain the configured API.
export const API_URL = typeof window !== 'undefined' ? '/api/v1' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1');

export class ApiError extends Error {
  constructor(public status: number, public message: string, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<boolean> | null = null;
let inMemoryAccessToken: string | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const isBrowser = typeof window !== 'undefined';
  const isLocalhost = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const configuredApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
  // If remote/tunneled (e.g. ngrok), only use the same-origin rewrite to avoid browser Mixed Content and CORS blocks
  const endpoints = isBrowser && !isLocalhost
    ? [`${API_URL}/auth/refresh`]
    : [...new Set([`${API_URL}/auth/refresh`, `${configuredApi}/auth/refresh`])];
  refreshPromise = (async () => {
    // The same-origin rewrite is preferred. The direct fallback also handles
    // sessions created by older builds that issued cookies from port 5000.
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          // Refresh is part of the initial workspace gate. Keep an expired
          // session from holding the whole app on its splash screen for 10s
          // per endpoint; try the local fallback only within this short bound.
          signal: AbortSignal.timeout(2_000),
        });
        // A rejected/expired refresh cookie cannot be repaired by trying the
        // same cookie against another URL. Stop and let the caller sign in.
        if (response.status === 401 || response.status === 403) return false;
        if (response.ok) {
          const payload = await response.json().catch(() => null) as { data?: { accessToken?: string } } | null;
          if (payload?.data?.accessToken) inMemoryAccessToken = payload.data.accessToken;
          return true;
        }
      } catch {
        // Try the next endpoint before declaring the session unrecoverable.
      }
    }
    return false;
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const timeoutMs = options.method && options.method !== 'GET' ? 45_000 : 15_000;
  
  // Here you would typically get the auth token from cookies or local storage
  // For this exercise, assume the backend is mocked or handles auth via httpOnly cookies
  // FormData bodies must not carry a Content-Type header - the browser sets the multipart
  // boundary itself when it's left unset.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const baseHeaders = {
    ...(isFormData || !options.body ? {} : { 'Content-Type': 'application/json' }),
    'Accept': 'application/json',
    ...options.headers,
  };

  let response: Response;
  const request = (signal?: AbortSignal | null) => {
    // Build headers for every attempt. A refresh rotates the in-memory access
    // token, so a retry must not reuse the expired bearer from the first try.
    const requestHeaders = { ...baseHeaders } as Record<string, string>;
    if (inMemoryAccessToken && !('Authorization' in requestHeaders)) {
      requestHeaders.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return fetch(url, {
      ...options,
      credentials: 'include',
      signal: signal || AbortSignal.timeout(timeoutMs),
      headers: requestHeaders,
    });
  };
  try {
    response = await request(options.signal);
  } catch (error) {
    // One bounded retry covers a transient reconnect without making a mutation
    // silently repeat; React Query handles the remaining read retry policy.
    // Do not retry a query that React Query has cancelled after its entity type
    // changed; retrying without the original signal would revive a stale request.
    if ((options.method && options.method !== 'GET') || options.signal?.aborted) throw error;
    response = await request();
  }

  if (response.status === 401) {
    // Access tokens can expire while a user is working on a requisition. Try
    // one coordinated refresh before treating the request as unauthenticated.
    // Do not recurse for auth endpoints themselves.
    const canRefresh = !path.startsWith('/auth/') && typeof window !== 'undefined';
    if (canRefresh && await refreshSession()) {
      response = await request();
    }
    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
    if (response.status === 401) throw new ApiError(response.status, 'Unauthorized', null);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const details = errorData?.error?.details;
    let detailMsg = '';
    if (Array.isArray(details) && details.length > 0) {
      detailMsg = details.map((d: any) => d.field ? `${d.field}: ${d.message}` : (d.message || JSON.stringify(d))).join(', ');
    } else if (details && typeof details === 'object' && typeof details.originalMessage === 'string') {
      const match = details.originalMessage.match(/Message:\s*`?(?:ERROR:\s*)?([^\n`]+)`?/i);
      detailMsg = match ? match[1].trim() : details.originalMessage.split('\n')[0].trim();
    }
    let baseMessage = errorData?.error?.message || errorData?.message || `Request failed with status ${response.status}`;
    if (baseMessage === 'An unexpected error occurred. Please try again.' && detailMsg) {
      baseMessage = detailMsg;
      detailMsg = '';
    }
    const message = detailMsg ? `${baseMessage} (${detailMsg})` : baseMessage;
    throw new ApiError(response.status, message, errorData);
  }

  // Successful DELETE endpoints may return 204 No Content. Do not try to
  // parse an empty response as JSON.
  if (response.status === 204) return undefined as T;

  const data = await response.json();
  const returnedAccessToken = data?.data?.accessToken;
  if (typeof returnedAccessToken === 'string' && returnedAccessToken.length > 0) {
    inMemoryAccessToken = returnedAccessToken;
  }
  return data.data; // Return the `data` field of ApiResponse
}

export async function fetchApiFile(path: string): Promise<Blob> {
  const request = () => fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: inMemoryAccessToken ? { Authorization: `Bearer ${inMemoryAccessToken}` } : {},
  });
  let response = await request();
  if (response.status === 401 && await refreshSession()) response = await request();
  if (!response.ok) throw new ApiError(response.status, `Could not load document (${response.status})`);
  return response.blob();
}
