import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { command, listRecords } from '../src/server/db';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('SUPABASE_URL', 'https://ztiegrqflrpoksuocrze.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-credential');
  vi.mocked(createClient).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('refuses a different database or partial credentials before creating a client', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co');
  await expect(command('rate')).rejects.toMatchObject({ code: 'DATABASE_TARGET' });
  expect(createClient).not.toHaveBeenCalled();
  vi.stubEnv('SUPABASE_URL', '');
  await expect(command('rate')).rejects.toMatchObject({ code: 'DATABASE_CONFIG' });
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  await expect(command('rate')).rejects.toMatchObject({ code: 'DATABASE_REQUIRED' });
});
it('uses bounded PostgREST ranges and collection/page filters with the service client', async () => {
  const q: any = { data: [], error: null };
  for (const name of ['select', 'eq', 'order', 'range']) q[name] = vi.fn(() => q);
  const from = vi.fn(() => q);
  vi.mocked(createClient).mockReturnValue({ from } as any);
  await listRecords('pages', { chainId: 8453, contract: '0xABC', limit: 25, offset: 25 });
  expect(from).toHaveBeenCalledWith('mint_pages');
  expect(q.eq).toHaveBeenCalledWith('chain_id', 8453);
  expect(q.eq).toHaveBeenCalledWith('contract', '0xabc');
  expect(q.range).toHaveBeenCalledWith(25, 49);
  await listRecords('revisions', { id: 'page-id', limit: 10, offset: 0 });
  expect(q.eq).toHaveBeenCalledWith('page_id', 'page-id');
  expect(q.range).toHaveBeenCalledWith(0, 9);
  await expect(listRecords('pages', { limit: 1000, offset: 0 })).rejects.toMatchObject({
    code: 'PAGINATION',
  });
});
it('bounds backend fetches and refuses redirects without disclosing service credentials', async () => {
  vi.mocked(createClient).mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  } as any);
  await command('rate', { key: 'fixture' });
  const config = vi.mocked(createClient).mock.calls[0][2]!;
  expect(config.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  await config.global!.fetch!('https://ztiegrqflrpoksuocrze.supabase.co/rest/v1/', {});
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
