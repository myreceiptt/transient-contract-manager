import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './server/csp';
import { checkHost } from './server/security';
import { AppError } from './lib/domain';

export function proxy(req: NextRequest) {
  try {
    checkHost(req);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.code : 'CONFIGURATION_ERROR' },
      { status: e instanceof AppError ? e.status : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const nonce = randomBytes(24).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/((?!api(?:/|$)|media(?:/|$)|_next/static|_next/image|favicon.ico).*)'],
};
