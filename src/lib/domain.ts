import { getAddress, isAddress, zeroAddress, keccak256, toBytes, encodeAbiParameters } from 'viem';
import { z } from 'zod';
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const uint = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, 'Use a whole number')
  .refine((s) => BigInt(s) < 2n ** 256n, 'Number too large');
export const positive = uint.refine((s) => BigInt(s) > 0n, 'Must be greater than zero');
export const addressSchema = z
  .string()
  .refine((a) => isAddress(a, { strict: false }), 'Invalid EVM address')
  .transform((a) => getAddress(a.toLowerCase()));
export const nonzeroAddress = addressSchema.refine(
  (a) => a !== zeroAddress,
  'Zero address is not allowed',
);
export const chainSchema = z
  .number()
  .int()
  .refine((n) => [1, 4663, 8453, 360, 31337].includes(n));
export const safeUrl = z
  .string()
  .max(2048)
  .refine((s) => s === '' || isSafeUrl(s), 'Use an HTTPS or IPFS URL');
export function isSafeUrl(s: string) {
  try {
    if (s.startsWith('ipfs://')) return /^ipfs:\/\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._~%-]+)*$/.test(s);
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
export const dropSchema = z
  .object({
    payoutReceiver: nonzeroAddress,
    initialSupply: positive,
    allowance: positive,
    currencyAddress: addressSchema,
    publicCost: uint,
    startTime: positive,
    publicDuration: positive,
    presaleDuration: uint,
    presaleCost: uint,
    presaleMerkleRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (BigInt(d.presaleDuration) > 0n && /^0x0+$/.test(d.presaleMerkleRoot))
      ctx.addIssue({
        code: 'custom',
        path: ['presaleMerkleRoot'],
        message: 'Presale requires a Merkle root',
      });
    if (BigInt(d.startTime) + BigInt(d.presaleDuration) + BigInt(d.publicDuration) >= 2n ** 64n)
      ctx.addIssue({ code: 'custom', message: 'Schedule is too large' });
  });
export const contentSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().max(6000),
    artwork: safeUrl,
    banner: safeUrl,
    externalUrl: safeUrl,
  })
  .strict();
export const draftSchema = z
  .object({
    chainId: chainSchema,
    contract: addressSchema,
    tokenId: positive,
    slug: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(80),
    content: contentSchema,
    sale: dropSchema,
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export type Drop = {
  dropType: number;
  payoutReceiver: string;
  initialSupply: bigint;
  supply: bigint;
  allowance: bigint;
  currencyAddress: string;
  startTime: bigint;
  presaleDuration: bigint;
  presaleCost: bigint;
  presaleMerkleRoot: string;
  publicDuration: bigint;
  publicCost: bigint;
  decayRate: bigint;
};
export const phases = ['Not configured', 'Scheduled', 'Presale', 'Public sale', 'Ended'] as const;
export function dropPhase(d: Drop, now: bigint) {
  if (d.payoutReceiver.toLowerCase() === zeroAddress) return 0;
  if (d.supply === 0n) return 4;
  if (now < d.startTime) return 1;
  if (now < d.startTime + d.presaleDuration) return 2;
  if (now < d.startTime + d.presaleDuration + d.publicDuration) return 3;
  return 4;
}
export function mintable(d: Drop, minted: bigint, presaleAllowance?: bigint) {
  const allowed = presaleAllowance ?? d.allowance;
  return allowed <= minted ? 0n : allowed - minted < d.supply ? allowed - minted : d.supply;
}
export function quote(d: Drop, qty: bigint, fee: bigint, phase: number) {
  const unit = phase === 2 ? d.presaleCost : d.publicCost;
  const price = unit * qty,
    protocolFee = fee * qty;
  return {
    price,
    protocolFee,
    value: d.currencyAddress.toLowerCase() === zeroAddress ? price + protocolFee : protocolFee,
  };
}
export function dropFromDraft(d: Draft): Drop {
  const s = d.sale;
  return {
    dropType: 1,
    payoutReceiver: s.payoutReceiver,
    initialSupply: BigInt(s.initialSupply),
    supply: BigInt(s.initialSupply),
    allowance: BigInt(s.allowance),
    currencyAddress: s.currencyAddress,
    startTime: BigInt(s.startTime),
    presaleDuration: BigInt(s.presaleDuration),
    presaleCost: BigInt(s.presaleCost),
    presaleMerkleRoot: s.presaleMerkleRoot,
    publicDuration: BigInt(s.publicDuration),
    publicCost: BigInt(s.publicCost),
    decayRate: 0n,
  };
}
export function serializable<T>(v: T): any {
  return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
}
export function stable(value: any): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(
      typeof value === 'bigint'
        ? value.toString()
        : typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
          ? value.toLowerCase()
          : value,
    );
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stable(value[k]))
      .join(',') +
    '}'
  );
}
export function fingerprint(value: any) {
  return keccak256(toBytes(stable(value)));
}
export function configFingerprint(d: Drop) {
  const { supply, ...config } = d;
  return fingerprint(config);
}
export function presaleLeaf(recipient: `0x${string}`, allowance: bigint) {
  const hashed = keccak256(encodeAbiParameters([{ type: 'address' }], [recipient]));
  const inner = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [hashed, allowance]),
  );
  return keccak256(inner);
}
export function verifyProof(leaf: `0x${string}`, proof: `0x${string}`[], root: string) {
  let h = leaf;
  for (const p of proof)
    h = keccak256(('0x' + [h.slice(2), p.slice(2)].sort().join('')) as `0x${string}`);
  return h.toLowerCase() === root.toLowerCase();
}
export const statuses = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PUBLISHING',
  'PUBLISHED',
  'PUBLISH_FAILED',
  'OUT_OF_SYNC',
  'ACTION_REQUIRED',
] as const;
export type PageRecord = {
  id: string;
  chain_id: number;
  contract: string;
  token_id: string;
  slug: string;
  version: number;
  state: (typeof statuses)[number];
  draft: Draft;
  published_revision: number | null;
  created_at: string;
  updated_at: string;
  baseline: string;
};
export function mediaUrl(s: string) {
  return s.startsWith('ipfs://') ? 'https://ipfs.io/ipfs/' + s.slice(7) : s;
}
