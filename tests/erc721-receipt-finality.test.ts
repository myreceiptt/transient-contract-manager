import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  c: {
    getChainId: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
    getBlock: vi.fn(),
  },
}));
vi.mock('../src/server/chain', () => ({
  client: () => mocks.c,
  exactChain: async () => {
    if ((await mocks.c.getChainId()) !== 1) throw new Error('Wrong chain');
  },
}));
vi.mock('../src/server/db', () => ({ command: mocks.command, listRecords: vi.fn() }));
import { confirmCreatorMint } from '../src/server/erc721-creator-mint';
const wallet = '0x1111111111111111111111111111111111111111' as const;
const contract = '0x2222222222222222222222222222222222222222';
const i = {
  id: 'review',
  actor: wallet,
  contract,
  chain_id: 1,
  page_id: null,
  status: 'SUBMITTED',
  tx_hash: '0x' + '1'.repeat(64),
  payload: { kind: 'erc721_creator_mint', tx: { data: '0x1234', value: '0', nonce: 3 } },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.command.mockResolvedValue(i);
  mocks.c.getChainId.mockResolvedValue(1);
  mocks.c.getTransaction.mockResolvedValue({
    from: wallet,
    to: contract,
    input: '0x1234',
    value: 0n,
    nonce: 3,
    chainId: 1,
  });
  mocks.c.getTransactionReceipt.mockResolvedValue({
    blockNumber: 20n,
    blockHash: '0xaaa',
    status: 'success',
    logs: [],
  });
  mocks.c.getBlock.mockImplementation(async (args) =>
    args.blockTag ? { number: 19n } : { hash: '0xaaa' },
  );
});
describe('ERC721 finality and recovery', () => {
  it('does not confirm an unfinalized receipt', async () => {
    expect(await confirmCreatorMint('review', { wallet, chainId: 1 })).toEqual({
      pending: true,
      status: 'AWAITING_FINALITY',
    });
    expect(mocks.command.mock.calls.map((c) => c[0])).toEqual(['intent_get']);
  });
  it('does not confirm a receipt removed by a reorganization', async () => {
    mocks.c.getBlock.mockResolvedValue({ hash: '0xbbb' });
    expect(await confirmCreatorMint('review', { wallet, chainId: 1 })).toEqual({
      pending: true,
      status: 'REORG_DETECTED',
    });
    expect(mocks.command).toHaveBeenCalledTimes(1);
  });
  it('keeps missing receipts submitted without automatic resubmission', async () => {
    mocks.c.getTransactionReceipt.mockRejectedValue(new Error('Not found'));
    expect(await confirmCreatorMint('review', { wallet, chainId: 1 })).toEqual({
      pending: true,
      status: 'SUBMITTED',
    });
  });
  it('records a finalized revert without issuing a Token ID', async () => {
    mocks.c.getTransactionReceipt.mockResolvedValue({
      blockNumber: 20n,
      blockHash: '0xaaa',
      status: 'reverted',
      logs: [],
    });
    mocks.c.getBlock.mockImplementation(async (args) =>
      args.blockTag ? { number: 21n } : { hash: '0xaaa' },
    );
    await confirmCreatorMint('review', { wallet, chainId: 1 });
    expect(mocks.command).toHaveBeenLastCalledWith(
      'intent_finish',
      expect.objectContaining({ status: 'REVERTED' }),
    );
  });
});
