import { targetChains } from '../lib/chains';

export function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === 'development';
  const walletConnect = !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  const rpcOrigins = [
    ...new Set(targetChains.map((c) => new URL(c.rpcUrls.default.http[0]).origin)),
  ];
  const walletOrigins = walletConnect
    ? [
        'https://relay.walletconnect.com',
        'wss://relay.walletconnect.com',
        'https://relay.walletconnect.org',
        'wss://relay.walletconnect.org',
        'https://rpc.walletconnect.com',
        'https://verify.walletconnect.com',
        'https://verify.walletconnect.org',
        'https://pulse.walletconnect.org',
        'https://api.web3modal.com',
        'https://api.web3modal.org',
      ]
    : [];
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // Existing React styles and the optional wallet modal use style attributes.
    // This exception does not permit inline JavaScript.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${[...rpcOrigins, ...walletOrigins, ...(dev ? ['http://127.0.0.1:8545', 'ws://localhost:3000'] : [])].join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    walletConnect
      ? 'frame-src https://verify.walletconnect.com https://verify.walletconnect.org'
      : "frame-src 'none'",
    ...(!dev ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
