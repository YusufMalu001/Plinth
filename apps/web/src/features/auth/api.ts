import { ApiErrorResponse, ApiResponse, SafeUser } from '@plinth/types';
import { fetchApi } from '../api/client';

interface AuthData {
  user: SafeUser;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | ApiErrorResponse | null;
  if (!response.ok || !body?.success) {
    const errorBody = body as ApiErrorResponse | null;
    throw new ApiRequestError(errorBody?.error?.message || 'The server could not complete the request', response.status);
  }
  return body as ApiResponse<T>;
}

export async function authenticatedApiRequest<T>(path: string, init?: RequestInit) {
  try {
    return await apiRequest<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
    await apiRequest<AuthData>('/auth/refresh', { method: 'POST' });
    return apiRequest<T>(path, init);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  });
  return parseResponse<T>(response);
}

export const authApi = {
  async login(email: string, password: string) {
    const response = await fetchApi<AuthData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return response.user;
  },

  async currentUser() {
    // Keep refresh handling in one place. The previous implementation refreshed
    // on every error (including 5xx responses), and multiple mounted consumers
    // could each start an 8–10s refresh request at the same time.
    const response = await fetchApi<AuthData>('/auth/me');
    return response.user;
  },

  async logout() {
    await fetchApi<never>('/auth/logout', { method: 'POST' });
  },

  async updateCurrentUser(data: { firstName?: string; lastName?: string; email?: string }) {
    const response = await fetchApi<AuthData>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    return response.user;
  }
};
