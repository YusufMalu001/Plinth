import { NextRequest, NextResponse } from 'next/server';

// Known marketing website routes that should always serve the branding site
const PUBLIC_BRANDING_ROUTES = [
  '/products',
  '/platform',
  '/pricing',
  '/about',
  '/demo',
  '/privacy',
  '/terms',
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Let Next internal assets and API requests pass through unchanged
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has('plinth_access') ||
    request.cookies.has('plinth_access');

  // Case 1: Unauthenticated user visiting root "/" -> Rewrite to public marketing site
  if (pathname === '/') {
    if (!hasSession) {
      return NextResponse.rewrite(new URL('/branding/index.html', request.url));
    }
    // Authenticated user directly gets into the ERP dashboard
    return NextResponse.next();
  }

  // Case 2: Public marketing website pages (/products, /pricing, etc.)
  const isBrandingRoute = PUBLIC_BRANDING_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isBrandingRoute) {
    // Rewrite to static prerendered HTML file in /branding/<route>/index.html
    return NextResponse.rewrite(new URL(`/branding${pathname}/index.html`, request.url));
  }

  // Case 3: Login route
  if (pathname === '/login') {
    // If already logged in, redirect directly to ERP root dashboard
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Case 4: Any other ERP dashboard page (e.g. /inventory, /sales, /procurement)
  // If unauthenticated, redirect to /login
  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
