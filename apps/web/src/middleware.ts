import { NextRequest, NextResponse } from 'next/server';

// Routes that require an authenticated session (synergy_access cookie present).
// The middleware does a lightweight cookie presence check — the real validation
// still happens server-side. This prevents the React app from rendering at all
// for unauthenticated visitors, avoiding any flash of protected content.
const PROTECTED_PREFIXES = ['/onboarding'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const needsAuth = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (needsAuth) {
    const hasSession = request.cookies.has('synergy_access');

    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on /onboarding and any sub-paths. Exclude static assets and API routes.
  matcher: ['/onboarding', '/onboarding/:path*'],
};
