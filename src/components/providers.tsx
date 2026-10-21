'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  WagmiProvider,
  createConfig,
  http,
  useConnection,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { targetChains, localChain, getChain } from '@/lib/chains';
import { api, short } from '@/lib/api-client';
const chains = [
  ...targetChains,
  ...(process.env.NEXT_PUBLIC_LOCAL_CHAIN_ENABLED === 'true' ? [localChain] : []),
] as [(typeof targetChains)[0], ...any[]];
const config = createConfig({
  chains,
  ssr: true,
  connectors: [
    injected(),
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      ? [
          walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
            metadata: {
              name: 'Transient Contract Manager',
              description: 'Independent collection management by ENDHONESA',
              url: process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000',
              icons: [],
            },
            showQrModal: true,
          }),
        ]
      : []),
  ],
  transports: Object.fromEntries(chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])])),
});
const AuthContext = createContext<{ ensureSession: (chainId: number) => Promise<void> }>({
  ensureSession: async () => {
    throw new Error('Wallet provider is not ready');
  },
});
function AuthProvider({ children }: { children: ReactNode }) {
  const { address, chainId: currentChainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  async function ensureSession(chainId: number) {
    if (!address) throw new Error('Connect your wallet first');
    if (currentChainId !== chainId) await switchChainAsync({ chainId });
    try {
      const s = await api('session');
      if (s.wallet.toLowerCase() === address.toLowerCase() && s.chainId === chainId) return;
    } catch {}
    const { message } = await api('challenge', { wallet: address, chainId });
    const signature = await signMessageAsync({ message });
    await api('login', { signature });
  }
  return <AuthContext.Provider value={{ ensureSession }}>{children}</AuthContext.Provider>;
}
export function Providers({ children }: { children: ReactNode }) {
  const [q] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={q}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
export const useSession = () => useContext(AuthContext);
export function WalletButton() {
  const { address, chainId } = useConnection();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  if (address)
    return (
      <div className="wallet-group">
        <span className="network-label">
          {[...targetChains, localChain].find((c) => c.id === chainId)?.name || 'Other network'}
        </span>
        <button
          className="button secondary compact"
          onClick={async () => {
            try {
              await api('logout');
            } catch {}
            await disconnectAsync();
          }}
          title="Disconnect wallet"
        >
          <span className="online-dot" />
          {short(address)} <span className="muted">×</span>
        </button>
      </div>
    );
  return (
    <div className="wallet-menu">
      <button className="button compact" onClick={() => setOpen(!open)}>
        Connect wallet <span>↗</span>
      </button>
      {open && (
        <div className="wallet-popover">
          <strong>Choose a wallet</strong>
          {connectors.map((c) => (
            <button
              className="button secondary"
              key={c.uid}
              disabled={isPending}
              onClick={async () => {
                try {
                  setError('');
                  await connectAsync({ connector: c });
                  setOpen(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {c.name}
            </button>
          ))}
          {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && (
            <small>
              WalletConnect requires a project ID in deployment settings. Installed browser wallets
              work directly.
            </small>
          )}
          {error && <small className="error">{error.slice(0, 200)}</small>}
        </div>
      )}
    </div>
  );
}
