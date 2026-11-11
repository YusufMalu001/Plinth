/**
 * Environment-aware URL resolution for Plinth.
 * 
 * Supports configurable public web origins across environments:
 * - Development: default http://localhost:3000
 * - Staging: NEXT_PUBLIC_STAGING_APP_URL, NEXT_PUBLIC_STAGING_WEB_URL, NEXT_PUBLIC_APP_URL or fallback
 * - Production: NEXT_PUBLIC_PRODUCTION_APP_URL, NEXT_PUBLIC_PRODUCTION_WEB_URL, NEXT_PUBLIC_APP_URL or fallback
 */

export function getAppBaseUrl(): string {
  // If explicitly configured in environment variables (Next.js public env vars)
  const explicitAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_WEB_URL;
  const explicitStagingUrl = process.env.NEXT_PUBLIC_STAGING_APP_URL || process.env.NEXT_PUBLIC_STAGING_WEB_URL;
  const explicitProdUrl = process.env.NEXT_PUBLIC_PRODUCTION_APP_URL || process.env.NEXT_PUBLIC_PRODUCTION_WEB_URL;

  const nodeEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV;

  if (nodeEnv === 'production' && explicitProdUrl) {
    return explicitProdUrl.replace(/\/+$/, '');
  }
  if ((nodeEnv === 'staging' || nodeEnv === 'stage') && explicitStagingUrl) {
    return explicitStagingUrl.replace(/\/+$/, '');
  }
  if (explicitAppUrl) {
    return explicitAppUrl.replace(/\/+$/, '');
  }

  // If executing in browser context, check runtime window origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  // Environment-based fallback defaults
  if (nodeEnv === 'staging' || nodeEnv === 'stage') {
    return explicitStagingUrl?.replace(/\/+$/, '') || 'https://stage.plinth.local';
  }
  if (nodeEnv === 'production') {
    return explicitProdUrl?.replace(/\/+$/, '') || 'https://plinth.local';
  }

  return 'http://localhost:3000';
}

/**
 * Builds an onboarding/login invite URL for an employee.
 * Generates environment-specific URL for staging, production, or local development.
 */
export function getEmployeeOnboardingLink(email: string, nextPath?: string): string {
  const baseUrl = getAppBaseUrl();
  const searchParams = new URLSearchParams();

  if (email) {
    searchParams.set('email', email);
  }
  if (nextPath) {
    searchParams.set('next', nextPath);
  }

  const query = searchParams.toString();
  return `${baseUrl}/login${query ? `?${query}` : ''}`;
}
