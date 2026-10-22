import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createSiweMessage, generateSiweNonce, parseSiweMessage } from 'viem/siwe';
import { getAddress, type Address, type Hex } from 'viem';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { command } from './db';
import { client, exactChain } from './chain';
import { addressSchema, chainSchema, AppError } from '../lib/domain';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
import { origin, checkOrigin, cookieName, cookieOptions } from './security';
export { origin, checkOrigin, readBody } from './security';
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
  const res = NextResponse.json({ message }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(cookieName('challenge'), id, { ...cookieOptions(), maxAge: 300 });
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
  const id = req.cookies.get(cookieName('challenge'))?.value;
  if (!id || !/^[a-f0-9]{64}$/.test(id))
    throw new AppError('NO_CHALLENGE', 'Request a new sign-in message', 401);
  const challenge = await command('challenge_consume', { id: hash(id) });
  if (!challenge)
    throw new AppError('NONCE_USED', 'Sign-in message expired or was already used', 401);
  const message = parseSiweMessage(challenge.message);
  if (
    message.uri !== origin() ||
    message.domain !== new URL(origin()).host ||
    message.chainId !== Number(challenge.chain_id) ||
    message.version !== '1'
  )
    throw new AppError('SIWE_ORIGIN', 'Sign-in message does not match this application', 401);
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
  const previous = req.cookies.get(cookieName('session'))?.value;
  if (previous && /^[a-f0-9]{64}$/.test(previous))
    await command('session_delete', { tokenHash: hash(previous) });
  const res = NextResponse.json(
    { wallet: challenge.wallet, chainId: Number(challenge.chain_id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  res.cookies.set(cookieName('challenge'), '', { ...cookieOptions(), maxAge: 0 });
  res.cookies.set(cookieName('session'), token, { ...cookieOptions(), maxAge: 4 * 3600 });
  res.cookies.set(cookieName('csrf'), csrf, {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: 4 * 3600,
  });
  return res;
}
export type Session = { wallet: Address; chainId: number };
export async function session(req: NextRequest, mutating = false): Promise<Session> {
  const token = req.cookies.get(cookieName('session'))?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new AppError('SIGN_IN_REQUIRED', 'Sign in with your wallet to continue', 401);
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
  await command('session_delete', {
    tokenHash: hash(req.cookies.get(cookieName('session'))!.value),
  });
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  for (const name of [cookieName('session'), cookieName('csrf'), cookieName('challenge')])
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
