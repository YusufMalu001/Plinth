import { fetchApi, ApiError } from '../features/api/client';

export { ApiError };

export const apiClient = {
  get: async <T>(url: string, params?: Record<string, string | undefined>): Promise<T> => {
    let queryString = '';
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, value);
        }
      });
      const query = searchParams.toString();
      if (query) queryString = `?${query}`;
    }
    return fetchApi<T>(`${url}${queryString}`, { method: 'GET' });
  },
  post: async <T>(url: string, body: unknown): Promise<T> => {
    return fetchApi<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  put: async <T>(url: string, body: unknown): Promise<T> => {
    return fetchApi<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },
  delete: async <T>(url: string): Promise<T> => {
    return fetchApi<T>(url, {
      method: 'DELETE',
    });
  },
  postForm: async <T>(url: string, body: FormData): Promise<T> => {
    return fetchApi<T>(url, {
      method: 'POST',
      body,
    });
  },
};
