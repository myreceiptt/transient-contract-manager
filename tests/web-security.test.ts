import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { origin, checkOrigin, cookieName, readBody } from '../src/server/security';
import { acquireSlot, operationBudget, rateLimit, requestIdentity } from '../src/server/abuse';
import { contentSecurityPolicy } from '../src/server/csp';
import { proxy } from '../src/proxy';
import { command } from '../src/server/db';
import { writesAllowed, requireWrites } from '../src/server/chain';
vi.mock('../src/server/db', () => ({ command: vi.fn() }));
const req = (headers: Record<string, string> = {}) =>
  new Request('https://preview.example/api', { headers });
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_ORIGIN', 'https://preview.example');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', '');
  vi.mocked(command).mockReset().mockResolvedValue({ allowed: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Origin and request boundary', () => {
  it.each([
    'http://preview.example',
    'https://preview.example/',
    'https://preview.example/path',
    'https://preview.example?x=1',
    'https://u:p@preview.example',
    'https://localhost',
    'https://127.0.0.1',
  ])('rejects unsafe hosted origin %s', (value) => {
    vi.stubEnv('APP_ORIGIN', value);
    expect(() => origin()).toThrow();
  });
  it('derives only the immutable preview hostname from trusted Vercel environment', () => {
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('VERCEL_URL', 'tcm-reviewed.vercel.app');
    expect(origin()).toBe('https://tcm-reviewed.vercel.app');
    vi.stubEnv('VERCEL_URL', 'tcm.vercel.app.evil.example');
    expect(() => origin()).toThrow();
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => origin()).toThrow();
  });
  it('allows HTTP only for local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    expect(origin()).toBe('http://localhost:3000');
    expect(cookieName('session')).toBe('tcm_session');
    vi.stubEnv('APP_ORIGIN', 'http://remote.example');
    expect(() => origin()).toThrow();
  });
  it('rejects missing, null, cross-site and forged host origins', () => {
    for (const headers of [
      {},
      { origin: 'null' },
      { origin: 'https://evil.example' },
      { origin: 'https://preview.example', host: 'evil.example' },
      { origin: 'https://preview.example', 'sec-fetch-site': 'cross-site' },
    ] as Record<string, string>[])
      expect(() => checkOrigin(req(headers))).toThrow();
    expect(() =>
      checkOrigin(req({ origin: 'https://preview.example', 'sec-fetch-site': 'same-origin' })),
    ).not.toThrow();
  });
  it.each(['text/plain', 'application/json-malicious'])('rejects content type %s', async (type) => {
    await expect(
      readBody(
        new Request('https://preview.example/api', {
          method: 'POST',
          headers: { 'content-type': type },
          body: '{}',
        }),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
  it('bounds declared and streaming request bytes and rejects malformed JSON', async () => {
    for (const [body, headers, status] of [
      ['{}', { 'content-length': '65537' }, 413],
      ['x'.repeat(65537), {}, 413],
      ['{', {}, 400],
      ['{}', { 'content-encoding': 'gzip' }, 415],
    ] as [string, Record<string, string>, number][]) {
      await expect(
        readBody(
          new Request('https://preview.example/api', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body,
          }),
        ),
      ).rejects.toMatchObject({ status });
    }
    expect(
      await readBody(
        new Request('https://preview.example/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: '{"op":"session"}',
        }),
      ),
    ).toEqual({ op: 'session' });
  });
  it('cancels a slow body at the deadline', async () => {
    const deadline = new AbortController(),
      cancelled = vi.fn();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const stream = new ReadableStream({ cancel: cancelled });
    const input = new Request('https://preview.example/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const result = expect(readBody(input)).rejects.toMatchObject({ status: 408 });
    deadline.abort();
    await result;
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe('Distributed quotas and local concurrency', () => {
  it('accepts only a valid Vercel IP and ignores spoofable headers elsewhere', () => {
    expect(requestIdentity(req({ 'x-vercel-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
    for (const value of ['', '1.1.1.1, 2.2.2.2', 'forged'])
      expect(() => requestIdentity(req({ 'x-vercel-forwarded-for': value }))).toThrow();
    vi.stubEnv('VERCEL', '');
    expect(() => requestIdentity(req())).toThrow();
    vi.stubEnv('NODE_ENV', 'development');
    expect(requestIdentity(req({ 'x-vercel-forwarded-for': '1.1.1.1' }))).toBe('local');
  });
  it('canonicalizes IPv6 identities', () => {
    expect(requestIdentity(req({ 'x-vercel-forwarded-for': '2001:4860:0:0:0:0:0:8888' }))).toBe(
      requestIdentity(req({ 'x-vercel-forwarded-for': '2001:4860::8888' })),
    );
  });
  it('rejects an exhausted IP before charging shared capacity', async () => {
    vi.mocked(command).mockResolvedValue({ allowed: false });
    await expect(
      rateLimit(req({ 'x-vercel-forwarded-for': '1.1.1.1' }), 'media'),
    ).rejects.toMatchObject({ status: 429 });
    expect(command).toHaveBeenCalledTimes(1);
  });
  it('isolates endpoint budgets and adds a verified-wallet quota', async () => {
    const input = req({ 'x-vercel-forwarded-for': '1.1.1.1' });
    await rateLimit(input, 'public');
    await rateLimit(input, 'workspace', '0xAdmin');
    const keys = vi.mocked(command).mock.calls.map((c) => c[1]?.key as string);
    expect(keys).toContain('v2:public:total');
    expect(keys).toContain('v2:workspace:total');
    expect(keys.some((k) => k.startsWith('v2:workspace:wallet:'))).toBe(true);
    expect(keys.some((k) => k.includes('1.1.1.1') || k.includes('0xAdmin'))).toBe(false);
    expect(operationBudget('inventory')).toBe('inventory');
    expect(() => operationBudget('arbitrary_rpc')).toThrow();
  });
  it('fails closed on limiter outages and malformed results', async () => {
    vi.mocked(command).mockRejectedValue(new Error('offline'));
    await expect(rateLimit(req({ 'x-vercel-forwarded-for': '1.1.1.1' }), 'auth')).rejects.toThrow();
    vi.mocked(command).mockResolvedValue({});
    await expect(
      rateLimit(req({ 'x-vercel-forwarded-for': '1.1.1.1' }), 'auth'),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('bounds in-flight media and releases slots on completion without cross-lane starvation', () => {
    const input = req({ 'x-vercel-forwarded-for': '1.1.1.1' });
    const slots = Array.from({ length: 6 }, () => acquireSlot(input, 'media'));
    try {
      expect(() => acquireSlot(input, 'media')).toThrow();
      acquireSlot(input, 'workspace')();
      slots[0]();
      slots[0]();
      acquireSlot(input, 'media')();
    } finally {
      slots.forEach((release) => release());
    }
  });
});

describe('CSP and transaction gates', () => {
  it('generates a fresh script nonce, overrides spoofed headers, and prohibits caching', () => {
    const input = new NextRequest('https://preview.example/', {
      headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src * 'unsafe-inline'" },
    });
    const a = proxy(input),
      b = proxy(input);
    const csp = a.headers.get('content-security-policy')!;
    expect(csp).not.toEqual(b.headers.get('content-security-policy'));
    expect(csp.split(';')[1]).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('attacker');
    expect(csp).not.toMatch(/(?:connect|img)-src[^;]* https:(?:;| )/);
    expect(a.headers.get('cache-control')).toBe('no-store');
    expect(a.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });
  it('denies invalid hosts and only enables known optional wallet connections', () => {
    expect(proxy(new NextRequest('https://evil.example/')).status).toBe(403);
    expect(contentSecurityPolicy('nonce')).not.toContain('walletconnect');
    vi.stubEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', 'public-project-id');
    expect(contentSecurityPolicy('nonce')).toContain('wss://relay.walletconnect.com');
    expect(contentSecurityPolicy('nonce')).not.toContain('*.');
  });
  it('denies every supported network even if the master flag is accidentally enabled', () => {
    vi.stubEnv('MAINNET_WRITES_ENABLED', 'true');
    vi.stubEnv('LOCAL_CHAIN_ENABLED', 'true');
    for (const id of [1, 4663, 8453, 360, 31337, 999]) {
      expect(writesAllowed(id)).toBe(false);
      expect(() => requireWrites(id)).toThrow();
    }
    vi.stubEnv('NODE_ENV', 'development');
    expect(writesAllowed(31337)).toBe(false);
  });
});
