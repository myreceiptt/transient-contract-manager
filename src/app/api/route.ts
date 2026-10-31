import { readCollectionProfile,saveCollectionProfile,pinCollectionProfile } from '@/server/collection-profile';
import { publicCollectorData } from '@/server/collector-intelligence';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Hex } from 'viem';
import { readMetadata } from '@/server/media';
import { pinTokenMetadata } from '@/server/nft-metadata-pin';
import { creatorAbi } from '@/lib/abi';
import { client, networkWritePermissions, writesAllowed } from '@/server/chain';
import { acquireSlot, operationBudget, rateLimit } from '@/server/abuse';
import { errorHeaders } from '@/server/security';
import { AppError, serializable, addressSchema, chainSchema, positive, uint } from '@/lib/domain';
import {
  challenge,
  login,
  logout,
  session,
  readBody,
  checkOrigin,
  requireSessionChain,
} from '@/server/auth';
import { inspect, authorize, tokenInventory, currencyInfo } from '@/server/chain';
import { command, listRecords } from '@/server/db';
import { createPage, savePage, rebasePage, pageForAdmin, baseline, mintInventory, changePageArchive, changePublishedPageSlug } from '@/server/workspace';
import {
  prepareAdmin,
  previewAdmin,
  preparePublication,
  previewPublication,
  previewCollectorQuote,
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
const pagination = z.object({
  limit: z.number().int().min(1).max(25).default(25),
  offset: z.number().int().min(0).max(10000).default(0),
});
export async function POST(req: NextRequest) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(req);
    release = acquireSlot(req, 'api');
    await rateLimit(req, 'intake');
    const raw = await readBody(req);
    const { op, p } = z
      .object({ op: z.string().max(40), p: z.record(z.string(), z.unknown()).default({}) })
      .strict()
      .parse(raw);
    const budget = operationBudget(op);
    if (!['workspace', 'transaction'].includes(budget)) {
      release();
      release = acquireSlot(req, budget);
    }
    // Workspace/transaction shared quotas are consumed only after session verification.
    if (!['workspace', 'transaction'].includes(budget)) await rateLimit(req, budget);
    if (op === 'challenge') return await challenge(req, p);
    if (op === 'login') return await login(req, p);
    if (op === 'logout') return await logout(req);
    let result: unknown;
    if (op === 'inspect') {
      const args = identity
        .extend({ wallet: addressSchema.optional(), tokenId: positive.optional() })
        .parse(p);
      result = await inspect(args.chainId, args.contract, args.wallet, BigInt(args.tokenId || '1'));
    } else if (op === 'collection_profile_read') {
      const a=identity.parse(p);
      result=await readCollectionProfile(a.chainId,a.contract);
    } else if (op === 'inventory') {
      const args = identity.extend({ start: z.number().int().min(1).max(1e7).optional() }).parse(p);
      result = await tokenInventory(args.chainId, args.contract, args.start);
    } else if (op === 'currency') {
      const a = z.object({ chainId: chainSchema, address: addressSchema }).parse(p);
      result = await currencyInfo(a.chainId, a.address);
    } else if (op === 'metadata') {
      result = await readMetadata(z.string().max(2048).parse(p.uri), req.signal);
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
    } else if (op === 'public_collectors') {
      const a=z.object({slug:z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).min(3).max(80),
        holder:addressSchema.optional(),activityOffset:z.number().int().min(0).max(10000).default(0),
        holderOffset:z.number().int().min(0).max(10000).default(0)}).parse(p);
      result=await publicCollectorData(a.slug,a.holder,a.activityOffset,a.holderOffset);
    } else if (op === 'public') {
      result = await publicPage(z.string().min(3).max(80).parse(p.slug));
    } else {
      const s = await session(req, true);
      release();
      release = acquireSlot(req, budget);
      await rateLimit(req, budget, s.wallet);
      if (op === 'session') result = s;
      else if (op === 'collection_profile_write') {
         const a=identity.parse(p);
         requireSessionChain(s,a.chainId);
         result=await saveCollectionProfile(a.chainId,a.contract,p.data,
           z.number().int().min(0).max(100000).parse(p.expectedVersion),s);
       }
       else if (op === 'collection_profile_pin') {
         const a=identity.parse(p);
         requireSessionChain(s,a.chainId);
         result=await pinCollectionProfile(a.chainId,a.contract,p.data,s,req.signal);
       }
       else if (op === 'metadata_pin') {
        const args = identity.parse(p);
        requireSessionChain(s, args.chainId);
        await authorize(args.chainId, args.contract, s.wallet);
        result = await pinTokenMetadata(p.metadata, req.signal);
      }
      else if (op === 'preview_admin') {
        const a = identity.parse(p);
        result = await previewAdmin(a.chainId, a.contract, p.action, s);
      }
      else if (op === 'mint_inventory') {
        const a = identity.extend({start:z.number().int().min(1).max(1e7).default(1)}).parse(p);
        result = await mintInventory(a.chainId,a.contract,a.start,s);
      } else if (op === 'page_lifecycle') {
        result = await changePageArchive(idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          z.enum(['archive','restore']).parse(p.action),s);
      }
      else if (op === 'pages') {
        const a = identity.parse(p);
        requireSessionChain(s, a.chainId);
        await authorize(a.chainId, a.contract, s.wallet);
        result = await listRecords('pages', { ...a, ...pagination.parse(p) });
      } else if (op === 'page') {
        const { page, info } = await pageForAdmin(idSchema.parse(p.id), s);
        result = {
          page,
          onchain: info,
          currentBaseline: baseline(info),
          changed: page.baseline !== baseline(info),
        };
      } else if (op === 'page_create') result = await createPage(p.draft, s);
      else if (op === 'page_slug_edit') {
        result = await changePublishedPageSlug(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          z.string().min(3).max(80).parse(p.expectedSlug),
          z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
            .min(3).max(80).parse(p.slug),
          s,
        );
      }
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
      else if (op === 'revisions' || op === 'audit' || op === 'page_history') {
        const id = idSchema.parse(p.id);
        await pageForAdmin(id, s);
        result = await listRecords(op, { id, ...pagination.parse(p) });
      } else if (op === 'prepare_admin') {
        const a = identity.parse(p);
        result = await prepareAdmin(a.chainId, a.contract, p.action, s);
      } else if (op === 'preview_collector_quote')
        result = await previewCollectorQuote(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          BigInt(positive.parse(p.quantity)),
          s,
        );
      else if (op === 'preview_publication')
        result = await previewPublication(
          idSchema.parse(p.id),
          z.number().int().positive().parse(p.expectedVersion),
          s,
        );
      else if (op === 'prepare_publication')
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
        result = await listRecords('history', { ...a, ...pagination.parse(p) });
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
        { status: 400, headers: errorHeaders(400) },
      );
    if (e instanceof AppError)
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: e.status, headers: errorHeaders(e.status) },
      );
    console.error('TCM_REQUEST_FAILED', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json(
      {
        error: 'REQUEST_FAILED',
        message: 'The request could not be completed. Check your network connection and try again.',
      },
      { status: 503, headers: errorHeaders(503) },
    );
  } finally {
    release?.();
  }
}
export async function GET() {
  return NextResponse.json(
    {
      name: 'Transient Contract Manager',
      version: '0.1.0',
      mainnetWrites: [1, 4663, 8453, 360].some(writesAllowed),
      networkWritePermissions,
      enabledNetworks: [1, 4663, 8453, 360].filter(writesAllowed),
      databaseConfigured:
        !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
        process.env.NODE_ENV !== 'production',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
