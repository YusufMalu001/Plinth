/**
 * Formats API, runtime, or network errors into short, formal, and user-friendly messages.
 */
export function formatErrorMessage(
  err: unknown,
  fallback = 'Unable to complete request. Please verify your details and try again.'
): string {
  if (!err) return fallback;

  let raw = '';
  if (typeof err === 'string') {
    raw = err.trim();
  } else if (err instanceof Error) {
    raw = err.message.trim();
  } else if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, any>;
    raw = (obj.error?.message || obj.message || '').trim();
    if (!raw && typeof obj.error === 'string') {
      raw = obj.error.trim();
    }
  }

  if (!raw || raw === '{}') return fallback;

  // Unique constraint error from DB
  const uniqueMatch = raw.match(/Unique constraint failed on the fields?: \((.+?)\)/i);
  if (uniqueMatch) {
    return `A record with this ${uniqueMatch[1]} already exists.`;
  }

  // Detect and sanitize any raw Prisma or DB dumps if they slip through
  if (
    raw.includes('Invalid `') ||
    raw.includes('invocation') ||
    raw.includes('PrismaClient') ||
    raw.includes('prisma')
  ) {
    const argMatch = raw.match(/Argument `?(\w+)`? is missing/i);
    if (argMatch) {
      return `Missing required field: ${argMatch[1]}.`;
    }
    const unknownMatch = raw.match(/Unknown argument `?(\w+)`?/i);
    if (unknownMatch) {
      return `Unrecognized field: ${unknownMatch[1]}.`;
    }
    return 'Database validation failed. Please check the provided information and try again.';
  }

  // Network or connectivity errors
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('Load failed')) {
    return 'Unable to connect to the server. Please check your network connection.';
  }

  // If the message is excessively long or contains stack traces / code lines
  if (raw.length > 140 || raw.includes('\n') || raw.includes('at ') || raw.includes('    at')) {
    const firstLine = raw.split(/[\n]/)[0].trim();
    if (firstLine.length > 5 && firstLine.length < 100 && !firstLine.includes('Error:') && !firstLine.includes('{')) {
      return firstLine.endsWith('.') ? firstLine : `${firstLine}.`;
    }
    return fallback;
  }

  return raw.endsWith('.') ? raw : `${raw}.`;
}
