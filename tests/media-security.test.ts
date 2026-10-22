import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { publicIp } from '../src/server/public-ip';
import { fetchMedia, readMetadata } from '../src/server/media';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
let response: PassThrough & { statusCode?: number; headers: Record<string, string> };
let options: any;
let send: () => void;
beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
  response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
  send = () => response.end('ok');
  mocks.request.mockReset().mockImplementation((opts, callback) => {
    options = opts;
    const request = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      end: () =>
        queueMicrotask(() => {
          callback(response);
          send();
        }),
    });
    opts.signal.addEventListener('abort', () => request.emit('error', new Error('aborted')), {
      once: true,
    });
    return request;
  });
});
afterEach(() => vi.restoreAllMocks());
describe('Pinned TLS media transport', () => {
  it('does not re-resolve a host that rebinds after validation and retains TLS hostname authentication', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.215.14', family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    expect((await fetchMedia('ipfs://bafyTestFixture123456789', 1024)).toString()).toBe('ok');
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(options).toMatchObject({
      hostname: '93.184.215.14',
      family: 4,
      servername: 'ipfs.io',
      agent: false,
      rejectUnauthorized: true,
      path: '/ipfs/bafyTestFixture123456789',
    });
    expect(options.headers.Host).toBe('ipfs.io');
    expect(options.headers.Authorization).toBeUndefined();
    expect(
      options.checkServerIdentity('93.184.215.14', {
        subjectaltname: 'DNS:wrong.example',
        subject: {},
      }),
    ).toBeInstanceOf(Error);
  });
  it('blocks the entire answer when any DNS address is private', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.215.14', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      code: 'MEDIA_NETWORK',
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('pins valid IPv6 too', async () => {
    mocks.lookup.mockResolvedValue([{ address: '2606:4700::1111', family: 6 }]);
    await fetchMedia('ipfs://bafyTestFixture123456789', 1024);
    expect(options).toMatchObject({
      hostname: '2606:4700::1111',
      family: 6,
      servername: 'ipfs.io',
    });
  });
  it('refuses redirects without a second request', async () => {
    response.statusCode = 302;
    response.headers.location = 'http://169.254.169.254/';
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      code: 'MEDIA_UNAVAILABLE',
    });
    expect(mocks.request).toHaveBeenCalledOnce();
  });
  it('rejects declared, streaming and encoded size-limit evasions', async () => {
    response.headers['content-length'] = '1025';
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      status: 413,
    });
    response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
    send = () => {
      response.write(Buffer.alloc(800));
      response.end(Buffer.alloc(300));
    };
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      status: 413,
    });
    response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: { 'content-encoding': 'gzip' },
    });
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      code: 'MEDIA_ENCODING',
    });
  });
  it('times out DNS and aborts stalled response connections', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    const dns = expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      status: 504,
    });
    deadline.abort();
    await dns;
    expect(mocks.request).not.toHaveBeenCalled();
    const second = new AbortController();
    vi.mocked(AbortSignal.timeout).mockReturnValue(second.signal);
    mocks.lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    send = () => second.abort();
    await expect(fetchMedia('ipfs://bafyTestFixture123456789', 1024)).rejects.toMatchObject({
      status: 504,
    });
  });
  it('rejects non-object JSON metadata', async () => {
    send = () => response.end('null');
    await expect(readMetadata('ipfs://bafyTestFixture123456789')).rejects.toMatchObject({
      code: 'METADATA_JSON',
    });
  });
});
describe('Special-use IP boundary', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.0.1',
    '198.18.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    '64:ff9b:1::1',
    '100::1',
    '2001::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '3fff::1',
    'fc00::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    'not-an-ip',
  ])('rejects %s', (ip) => expect(publicIp(ip)).toBe(false));
  it.each(['1.1.1.1', '93.184.215.14', '2606:4700::1111', '2001:4860:4860::8888'])(
    'allows ordinary global unicast %s',
    (ip) => expect(publicIp(ip)).toBe(true),
  );
});
