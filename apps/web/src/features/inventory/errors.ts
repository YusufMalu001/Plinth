import { ApiError } from '../api/client';

export function extractErrorMessage(err: unknown): { message: string; details?: string[] } {
  if (err instanceof ApiError) {
    const errorData = err.data as { error?: { message?: string; details?: unknown } } | undefined;
    const details = errorData?.error?.details;
    let detailMessages: string[] = [];
    if (Array.isArray(details)) {
      detailMessages = details.map((d: { path?: string[]; message?: string; field?: string }) =>
        `${d.path?.join('.') || d.field || 'Field'}: ${d.message || 'Invalid value'}`,
      );
    }
    return {
      message: errorData?.error?.message || err.message || 'Request failed',
      details: detailMessages.length > 0 ? detailMessages : undefined,
    };
  }
  return { message: (err as Error).message || 'An unexpected error occurred' };
}
