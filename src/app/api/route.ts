import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Hex } from 'viem';
import { readMetadata } from '@/server/media';
import { creatorAbi } from '@/lib/abi';
import { client } from '@/server/chain';
import { AppError, serializable, addressSchema, chainSchema, positive, uint } from '@/lib/domain';
import {
  challenge,
  login,
  logout,
  session,
  readBody,
  checkOrigin,
  rateLimit,
  requireSessionChain,
} from '@/server/auth';
import { inspect, authorize, tokenInventory, currencyInfo } from '@/server/chain';
import { command } from '@/server/db';
import { createPage, savePage, rebasePage, pageForAdmin, baseline } from '@/server/workspace';
import {
  prepareAdmin,
  preparePublication,
  publishContent,
  publicPage,
  prepareMint,
  preflight,
  attachIntent,
  confirmIntent,
  getIntent,
  cancelIntent,
} from '@/server/transactions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const identity = z.object({ chainId: chainSchema, contract: addressSchema });
const idSchema = z.string().uuid();
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const raw = await readBody(req);
    const { op, p = {} } = z.object({ op: z.string().max(40), p: z.any().optional() }).parse(raw);
    await rateLimit(req);
    if (op === 'challenge') return await challenge(req, p);
    if (op === 'login') return await login(req, p);
    if (op === 'logout') return await logout(req);
    let result: unknown;
    if (op === 'inspect') {
      const args = identity
        .extend({ wallet: addressSchema.optional(), tokenId: positive.optional() })
        .parse(p);
      result = await inspect(args.chainId, args.contract, args.wallet, BigInt(args.tokenId || '1'));
    } else if (op === 'inventory') {
      const args = identity.extend({ start: z.number().int().min(1).max(1e7).optional() }).parse(p);
      result = await tokenInventory(args.chainId, args.contract, args.start);
    } else if (op === 'currency') {
      const a = z.object({ chainId: chainSchema, address: addressSchema }).parse(p);
      result = await currencyInfo(a.chainId, a.address);
    } else if (op === 'metadata') {
      result = await readMetadata(z.string().max(2048).parse(p.uri));
    } else if (op === 'balance') {
      const a = identity.extend({ holder: addressSchema, tokenId: positive }).parse(p);
      const info = await inspect(a.chainId, a.contract, undefined, BigInt(a.tokenId));
      result = {
        balance: await client(a.chainId).readContract({
          address: a.contract,
          abi: creatorAbi,
          functionName: 'balanceOf',
          args: [a.holder, BigInt(a.tokenId)],
          blockNumber: info.blockNumber,
        }),
      };
    } else if (op === 'public') {
      result = await publicPage(z.string().min(3).max(80).parse(p.slug));
    } else {
      const s = await session(req, true);
      if (op === 'session') result = s;
      else if (op === 'pages') {
        const a = identity.parse(p);
        requireSessionChain(s, a.chainId);
        await authorize(a.chainId, a.contract, s.wallet);
        result = await command('page_list', a);
      } else if (op === 'page') {
        const { page, info } = await pageForAdmin(idSchema.parse(p.id), s);
        result = {
          page,
          onchain: info,
          currentBaseline: baseline(info),
          changed: page.baseline !== baseline(info),
        };
      } else if (op === 'page_create') result = await createPage(p.draft, s);
      else if (op === 'page_save')
        result = await savePage(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          p.draft,
          s,
        );
      else if (op === 'page_rebase')
        result = await rebasePage(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          z
            .string()
            .regex(/^0x[0-9a-f]{64}$/)
            .parse(p.accepted),
          s,
        );
      else if (op === 'revisions' || op === 'audit') {
        const id = idSchema.parse(p.id);
        await pageForAdmin(id, s);
        result = await command(op, { id });
      } else if (op === 'prepare_admin') {
        const a = identity.parse(p);
        result = await prepareAdmin(a.chainId, a.contract, p.action, s);
      } else if (op === 'prepare_publication')
        result = await preparePublication(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          s,
        );
      else if (op === 'publish_content')
        result = await publishContent(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          z.string().parse(p.expectedBaseline),
          s,
        );
      else if (op === 'prepare_mint') {
        const a = z
          .object({
            slug: z.string().min(3).max(80),
            quantity: positive,
            presaleAllowance: uint.default('0'),
            proof: z
              .array(z.string().regex(/^0x[0-9a-fA-F]{64}$/))
              .max(64)
              .default([]),
          })
          .parse(p);
        result = await prepareMint(
          a.slug,
          BigInt(a.quantity),
          BigInt(a.presaleAllowance),
          a.proof as Hex[],
          s,
        );
      } else if (op === 'preflight') result = await preflight(idSchema.parse(p.id), s);
      else if (op === 'attach')
        result = await attachIntent(
          idSchema.parse(p.id),
          z
            .string()
            .regex(/^0x[0-9a-fA-F]{64}$/)
            .parse(p.txHash) as Hex,
          s,
        );
      else if (op === 'cancel_replacement')
        result = await cancelIntent(
          idSchema.parse(p.id),
          z
            .string()
            .regex(/^0x[0-9a-fA-F]{64}$/)
            .parse(p.txHash) as Hex,
          s,
        );
      else if (op === 'confirm') result = await confirmIntent(idSchema.parse(p.id), s);
      else if (op === 'intent') result = await getIntent(idSchema.parse(p.id), s);
      else if (op === 'history') {
        const a = identity.parse(p);
        requireSessionChain(s, a.chainId);
        await authorize(a.chainId, a.contract, s.wallet);
        result = await command('intent_list', a);
      } else throw new AppError('UNKNOWN_OPERATION', 'Unknown operation', 404);
    }
    return NextResponse.json(serializable(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    console.error('TCM_REQUEST_FAILED', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json(
      {
        error: 'REQUEST_FAILED',
        message: 'The request could not be completed. Check your network connection and try again.',
      },
      { status: 503 },
    );
  }
}
export async function GET() {
  return NextResponse.json(
    {
      name: 'Transient Contract Manager',
      version: '0.1.0',
      mainnetWrites: process.env.MAINNET_WRITES_ENABLED === 'true',
      databaseConfigured:
        !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
        process.env.NODE_ENV !== 'production',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
