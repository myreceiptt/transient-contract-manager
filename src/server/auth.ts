import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { getAddress, type Address, type Hex } from 'viem';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { command } from './db';
import { client, exactChain } from './chain';
import { addressSchema, chainSchema, AppError } from '../lib/domain';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function origin() {
  const raw =
    process.env.APP_ORIGIN ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!raw) throw new AppError('ORIGIN_REQUIRED', 'APP_ORIGIN must be configured', 503);
  return new URL(raw).origin;
}
export function checkOrigin(req: Request) {
  if (req.headers.get('origin') !== origin())
    throw new AppError('ORIGIN_DENIED', 'Request origin does not match this application', 403);
}
export async function readBody(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('application/json'))
    throw new AppError('CONTENT_TYPE', 'Use JSON', 415);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError('EMPTY_BODY', 'Missing request body');
  let n = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > 65536) {
      await reader.cancel();
      throw new AppError('BODY_TOO_LARGE', 'Request exceeds 64 KiB', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('INVALID_JSON', 'Invalid JSON request');
  }
}
export async function rateLimit(req: Request) {
  const ip = req.headers.get('x-vercel-forwarded-for')?.split(',')[0] || 'local';
  const global = await command('rate', { key: 'global', limit: 600 });
  const perIp = await command('rate', { key: hash(ip), limit: 90 });
  if (!global.allowed || !perIp.allowed)
    throw new AppError('RATE_LIMIT', 'Too many requests. Please wait a minute.', 429);
}
const cookieOptions = () => ({
  httpOnly: true,
  secure: origin().startsWith('https:'),
  sameSite: 'strict' as const,
  path: '/',
});
export async function challenge(req: NextRequest, body: unknown) {
  const { wallet, chainId } = z.object({ wallet: addressSchema, chainId: chainSchema }).parse(body);
  const c = client(chainId);
  await exactChain(c, chainId);
  const id = randomBytes(32).toString('hex'),
    expiresAt = new Date(Date.now() + 5 * 60000);
  const message = createSiweMessage({
    address: wallet,
    chainId,
    domain: new URL(origin()).host,
    uri: origin(),
    version: '1',
    nonce: generateSiweNonce(),
    issuedAt: new Date(),
    expirationTime: expiresAt,
    statement:
      'Sign in to Transient Contract Manager by ENDHONESA. This does not approve any blockchain transaction.',
  });
  await command('challenge_create', {
    id: hash(id),
    message,
    wallet: wallet.toLowerCase(),
    chainId,
    expiresAt: expiresAt.toISOString(),
  });
  const res = NextResponse.json({ message });
  res.cookies.set('tcm_challenge', id, { ...cookieOptions(), maxAge: 300 });
  return res;
}
export async function login(req: NextRequest, body: unknown) {
  const { signature } = z
    .object({
      signature: z
        .string()
        .regex(/^0x[0-9a-fA-F]+$/)
        .max(16384),
    })
    .parse(body);
  const id = req.cookies.get('tcm_challenge')?.value;
  if (!id) throw new AppError('NO_CHALLENGE', 'Request a new sign-in message', 401);
  const challenge = await command('challenge_consume', { id: hash(id) });
  if (!challenge)
    throw new AppError('NONCE_USED', 'Sign-in message expired or was already used', 401);
  const c = client(Number(challenge.chain_id));
  await exactChain(c, Number(challenge.chain_id));
  const valid = await c.verifySiweMessage({
    message: challenge.message,
    signature: signature as Hex,
    address: getAddress(challenge.wallet),
    domain: new URL(origin()).host,
    time: new Date(),
  });
  if (!valid)
    throw new AppError('SIGNATURE_INVALID', 'Wallet signature could not be verified', 401);
  const token = randomBytes(32).toString('hex'),
    csrf = randomBytes(32).toString('hex');
  await command('session_create', {
    tokenHash: hash(token),
    wallet: challenge.wallet,
    chainId: Number(challenge.chain_id),
    csrfHash: hash(csrf),
    expiresAt: new Date(Date.now() + 4 * 3600000).toISOString(),
  });
  const res = NextResponse.json({ wallet: challenge.wallet, chainId: Number(challenge.chain_id) });
  res.cookies.set('tcm_challenge', '', { ...cookieOptions(), maxAge: 0 });
  res.cookies.set('tcm_session', token, { ...cookieOptions(), maxAge: 4 * 3600 });
  res.cookies.set('tcm_csrf', csrf, { ...cookieOptions(), httpOnly: false, maxAge: 4 * 3600 });
  return res;
}
export type Session = { wallet: Address; chainId: number };
export async function session(req: NextRequest, mutating = false): Promise<Session> {
  const token = req.cookies.get('tcm_session')?.value;
  if (!token) throw new AppError('SIGN_IN_REQUIRED', 'Sign in with your wallet to continue', 401);
  const s = await command('session_get', { tokenHash: hash(token) });
  if (!s) throw new AppError('SESSION_EXPIRED', 'Your session expired. Sign in again.', 401);
  if (mutating) {
    checkOrigin(req);
    const csrf = req.headers.get('x-csrf-token') ?? '';
    const actual = Buffer.from(hash(csrf));
    const expected = Buffer.from(s.csrf_hash);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new AppError('CSRF_DENIED', 'Request verification failed. Sign in again.', 403);
  }
  return { wallet: getAddress(s.wallet), chainId: Number(s.chain_id) };
}
export async function logout(req: NextRequest) {
  await session(req, true);
  await command('session_delete', { tokenHash: hash(req.cookies.get('tcm_session')!.value) });
  const res = NextResponse.json({ ok: true });
  for (const name of ['tcm_session', 'tcm_csrf', 'tcm_challenge'])
    res.cookies.set(name, '', { ...cookieOptions(), maxAge: 0 });
  return res;
}
export function requireSessionChain(s: Session, id: number) {
  if (s.chainId !== id)
    throw new AppError(
      'SESSION_CHAIN',
      'Switch your wallet network and sign in on this collection’s chain',
      403,
    );
}
