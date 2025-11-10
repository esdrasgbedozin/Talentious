import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for route protection
 * Checks if user is authenticated before accessing protected routes
 */

// Routes that require authentication
const protectedRoutes = ['/onboarding', '/profile', '/dashboard'];

// Routes that should redirect to onboarding if user is already authenticated
const authRoutes = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check for session cookie (set by AuthContext after login)
  const hasSession = request.cookies.get('talentious_session')?.value;
  
  // Check if the current route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));
  
  // Redirect to login if trying to access protected route without session
  if (isProtectedRoute && !hasSession) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  
  // Redirect to onboarding if already authenticated and trying to access auth pages
  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }
  
  return NextResponse.next();
}

// Configure which routes should run the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
