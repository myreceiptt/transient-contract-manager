import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSiweMessage, parseSiweMessage } from 'viem/siwe';
import { challenge, login, session, logout, hash } from '../src/server/auth';
import { command } from '../src/server/db';
const verify = vi.hoisted(() => vi.fn());
vi.mock('../src/server/db', () => ({ command: vi.fn() }));
vi.mock('../src/server/chain', () => ({
  client: () => ({ verifySiweMessage: verify }),
  exactChain: vi.fn(),
}));
const wallet = '0x1111111111111111111111111111111111111111';
const token = 'a'.repeat(64),
  csrf = 'b'.repeat(64);
const request = (cookie: string) =>
  new NextRequest('https://preview.example/api', {
    headers: { cookie, origin: 'https://preview.example', 'x-csrf-token': csrf },
  });
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_ORIGIN', 'https://preview.example');
  verify.mockReset().mockResolvedValue(true);
  vi.mocked(command).mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
it('issues a host-only Secure HttpOnly challenge bound to the exact SIWE origin', async () => {
  const response = await challenge(request(''), { wallet, chainId: 1 });
  const cookie = response.cookies.get('__Host-tcm_challenge')!;
  expect(cookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 300,
  });
  expect(cookie.domain).toBeUndefined();
  expect(response.headers.get('cache-control')).toBe('no-store');
  const message = parseSiweMessage((await response.json()).message);
  expect(message.domain).toBe('preview.example');
  expect(message.uri).toBe('https://preview.example');
});
function storedChallenge(uri = 'https://preview.example') {
  return {
    wallet,
    chain_id: 1,
    message: createSiweMessage({
      address: wallet,
      chainId: 1,
      domain: 'preview.example',
      uri,
      version: '1',
      nonce: '123456789abcdefg',
      issuedAt: new Date(),
      expirationTime: new Date(Date.now() + 300000),
    }),
  };
}
it('rotates sessions and issues Secure cookies, with only the CSRF token readable by JavaScript', async () => {
  vi.mocked(command).mockImplementation(async (op) =>
    op === 'challenge_consume' ? storedChallenge() : {},
  );
  const response = await login(
    request(`__Host-tcm_challenge=${token}; __Host-tcm_session=${token}`),
    { signature: '0x1234' },
  );
  expect(verify).toHaveBeenCalledOnce();
  expect(command).toHaveBeenCalledWith('session_delete', { tokenHash: hash(token) });
  const sessionCookie = response.cookies.get('__Host-tcm_session')!;
  expect(sessionCookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 14400,
  });
  expect(sessionCookie.domain).toBeUndefined();
  expect(sessionCookie.value).not.toBe(token);
  expect(response.cookies.get('__Host-tcm_csrf')).toMatchObject({
    secure: true,
    httpOnly: false,
    sameSite: 'strict',
    path: '/',
  });
  expect(response.cookies.get('__Host-tcm_challenge')?.maxAge).toBe(0);
});
it('rejects legacy non-host cookies, consumed nonces and SIWE URI mismatches', async () => {
  await expect(
    login(request(`tcm_challenge=${token}`), { signature: '0x1234' }),
  ).rejects.toMatchObject({ code: 'NO_CHALLENGE' });
  vi.mocked(command).mockResolvedValue(null);
  await expect(
    login(request(`__Host-tcm_challenge=${token}`), { signature: '0x1234' }),
  ).rejects.toMatchObject({ code: 'NONCE_USED' });
  vi.mocked(command).mockResolvedValue(storedChallenge('https://evil.example'));
  await expect(
    login(request(`__Host-tcm_challenge=${token}`), { signature: '0x1234' }),
  ).rejects.toMatchObject({ code: 'SIWE_ORIGIN' });
  expect(verify).not.toHaveBeenCalled();
});
it('enforces session expiry and CSRF, and clears the same protected cookie names on logout', async () => {
  vi.mocked(command).mockResolvedValue(null);
  await expect(session(request(`__Host-tcm_session=${token}`), true)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  vi.mocked(command).mockResolvedValue({ wallet, chain_id: 1, csrf_hash: hash('different') });
  await expect(session(request(`__Host-tcm_session=${token}`), true)).rejects.toMatchObject({
    code: 'CSRF_DENIED',
  });
  vi.mocked(command).mockResolvedValue({ wallet, chain_id: 1, csrf_hash: hash(csrf) });
  const response = await logout(request(`__Host-tcm_session=${token}`));
  for (const kind of ['session', 'csrf', 'challenge'])
    expect(response.cookies.get(`__Host-tcm_${kind}`)).toMatchObject({
      maxAge: 0,
      secure: true,
      path: '/',
    });
});
