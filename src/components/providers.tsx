'use client';

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
  type ReactNode,
} from 'react';
import { createPublicClient, http, toHex, type Address, type Hex } from 'viem';
import { targetChains, localChain, getChain } from '@/lib/chains';
import { api, short } from '@/lib/api-client';

// EIP-1193 + EIP-6963 browser wallet bridge. No embedded wallets or
// WalletConnect SDK in the critical login / transaction path.
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (name: string, fn: (...args: any[]) => void) => void;
  removeListener?: (name: string, fn: (...args: any[]) => void) => void;
  providers?: EthereumProvider[];
  isPhantom?: boolean;
  isOkxWallet?: boolean;
  isMetaMask?: boolean;
};
type Discovered = { id: string; name: string; provider: EthereumProvider };
type WalletSession = {
  address?: Address;
  chainId?: number;
  provider?: EthereumProvider;
  options: Discovered[];
  connecting: boolean;
  connect: (item: Discovered) => Promise<void>;
  disconnect: () => void;
  ensureSession: (chain: number) => Promise<void>;
};
const WalletContext = createContext<WalletSession | null>(null);

function allowedChain(id: number) {
  return [...targetChains,
    ...(process.env.NEXT_PUBLIC_LOCAL_CHAIN_ENABLED === 'true' ? [localChain] : []),
  ].find(chain => chain.id === id);
}
function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}
function requireChainId(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error('Wallet returned an invalid chain ID');
  }
  const id = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(id)) throw new Error('Invalid wallet chain ID');
  return id;
}
function injectedCandidates(): Discovered[] {
  if (typeof window === 'undefined') return [];
  const w = window as Window & {
    ethereum?: EthereumProvider;
    phantom?: { ethereum?: EthereumProvider };
    okxwallet?: EthereumProvider;
  };
  const candidates: Discovered[] = [];
  const add = (id: string, name: string, provider?: EthereumProvider) => {
    if (provider?.request && !candidates.some(entry => entry.provider === provider)) {
      candidates.push({ id, name, provider });
    }
  };
  add('phantom', 'Phantom', w.phantom?.ethereum);
  add('okx', 'OKX Wallet', w.okxwallet);
  for (const p of w.ethereum?.providers ?? []) {
    add(p.isPhantom ? 'phantom' : p.isOkxWallet ? 'okx' : p.isMetaMask ? 'metamask' : 'injected',
      p.isPhantom ? 'Phantom' : p.isOkxWallet ? 'OKX Wallet' : p.isMetaMask ? 'MetaMask' : 'Browser wallet', p);
  }
  add('ethereum', w.ethereum?.isPhantom ? 'Phantom' : w.ethereum?.isOkxWallet ? 'OKX Wallet'
    : w.ethereum?.isMetaMask ? 'MetaMask' : 'Browser wallet', w.ethereum);
  return candidates;
}

export function Providers({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Discovered[]>([]);
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [provider, setProvider] = useState<EthereumProvider>();
  const [connecting, setConnecting] = useState(false);
  const active = useRef<EthereumProvider | undefined>(undefined);
  const update = useCallback((candidates: Discovered[]) => {
    setOptions(previous => {
      const next = [...previous];
      for (const candidate of candidates) {
        if (!next.some(value => value.provider === candidate.provider ||
          (value.id === candidate.id && value.name === candidate.name))) {
          next.push(candidate);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    update(injectedCandidates());
    const announced = (event: Event) => {
      const detail = (event as CustomEvent<{
        info?: { uuid?: string; name?: string };
        provider?: EthereumProvider;
      }>).detail;
      if (detail?.provider?.request) {
        update([{ id: detail.info?.uuid || detail.info?.name || 'eip6963',
          name: detail.info?.name || 'Injected wallet', provider: detail.provider }]);
      }
    };
    window.addEventListener('eip6963:announceProvider', announced);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', announced);
  }, [update]);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: unknown) =>
      setAddress(Array.isArray(accounts) && isAddress(accounts[0]) ? accounts[0] : undefined);
    const chainChanged = (id: unknown) => {
      try { setChainId(requireChainId(id)); } catch { setChainId(undefined); }
    };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', chainChanged);
    };
  }, [provider]);

  const connect = useCallback(async (item: Discovered) => {
    setConnecting(true);
    try {
      const accounts = await item.provider.request({ method: 'eth_requestAccounts' });
      if (!Array.isArray(accounts) || !isAddress(accounts[0])) throw new Error('No wallet address returned');
      const chain = requireChainId(await item.provider.request({ method: 'eth_chainId' }));
      active.current = item.provider;
      setAddress(accounts[0]);
      setChainId(chain);
      setProvider(item.provider);
    } finally { setConnecting(false); }
  }, []);
  const disconnect = useCallback(() => {
    // EIP-1193 extensions have no standard programmatic revocation API.
    active.current = undefined;
    setAddress(undefined);
    setChainId(undefined);
    setProvider(undefined);
  }, []);

  const ensureSession = useCallback(async (targetChain: number) => {
    const p = active.current;
    if (!p || !address) throw new Error('Connect your wallet first');
    const target = allowedChain(targetChain);
    if (!target) throw new Error('Unsupported wallet network');
    const liveChain = requireChainId(await p.request({ method: 'eth_chainId' }));
    if (liveChain !== targetChain) {
      try {
        await p.request({ method: 'wallet_switchEthereumChain',
          params: [{ chainId: toHex(targetChain) }] });
      } catch (error) {
        if ((error as { code?: number }).code !== 4902) throw error;
        await p.request({ method: 'wallet_addEthereumChain',
          params: [{ chainId: toHex(targetChain), chainName: target.name,
            nativeCurrency: target.nativeCurrency, rpcUrls: target.rpcUrls.default.http }] });
        await p.request({ method: 'wallet_switchEthereumChain',
          params: [{ chainId: toHex(targetChain) }] });
      }
      const verified = requireChainId(await p.request({ method: 'eth_chainId' }));
      if (verified !== targetChain) throw new Error('Wallet did not switch to requested network');
      setChainId(verified);
    }
    const accounts = await p.request({ method: 'eth_accounts' });
    if (!Array.isArray(accounts) || !isAddress(accounts[0]) ||
      accounts[0].toLowerCase() !== address.toLowerCase())
      throw new Error('Wallet account changed; reconnect before signing in');
    try {
      const s = await api('session');
      if (s.wallet.toLowerCase() === address.toLowerCase() && s.chainId === targetChain) return;
    } catch {}
    const { message } = await api('challenge', { wallet: address, chainId: targetChain });
    const signature = await p.request({ method: 'personal_sign', params: [toHex(message), address] });
    if (typeof signature !== 'string' || !/^0x[\da-f]+$/i.test(signature))
      throw new Error('Wallet did not return a valid signature');
    await api('login', { signature });
  }, [address]);

  return (
    <WalletContext.Provider value={{
      address, chainId, provider, options, connecting, connect, disconnect, ensureSession,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

function useWalletSession() {
  const session = useContext(WalletContext);
  if (!session) throw new Error('Wallet context is missing');
  return session;
}
export function useSession() {
  const { ensureSession } = useWalletSession();
  return { ensureSession };
}
export function useConnection() {
  const { address, chainId } = useWalletSession();
  return { address, chainId };
}
export function useWalletClient() {
  const { address, provider, chainId } = useWalletSession();
  const data = useMemo(() => !address || !provider ? undefined : {
    chain: chainId ? getChain(chainId) : undefined,
    sendTransaction: async (tx: { account?: Address; chain?: unknown; to: Address; data?: Hex; value?: bigint }) => {
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{
        from: address, to: tx.to, data: tx.data, value: toHex(tx.value ?? 0n),
      }] });
      if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        throw new Error('Wallet returned an invalid transaction hash');
      }
      return hash as Hex;
    },
  }, [address, provider, chainId]);
  return { data };
}
export function usePublicClient({ chainId }: { chainId: number }) {
  return useMemo(() => {
    try {
      const chain = getChain(chainId);
      return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
    } catch { return undefined; }
  }, [chainId]);
}
export function WalletButton() {
  const { address, chainId, options, connecting, connect, disconnect } = useWalletSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  if (address) {
    return (
      <div className="wallet-group">
        <span className="network-label">
          {[...targetChains, localChain].find(c => c.id === chainId)?.name || 'Other network'}
        </span>
        <button className="button secondary compact" onClick={async () => {
          try { await api('logout'); } catch {}
          disconnect();
        }} title="Disconnect wallet">
          <span className="online-dot" /> {short(address)} <span className="muted">×</span>
        </button>
      </div>
    );
  }
  return (
    <div className="wallet-menu">
      <button className="button compact" onClick={() => setOpen(!open)}>
        Connect wallet <span>↗</span>
      </button>
      {open && <div className="wallet-popover">
        <strong>Choose a wallet</strong>
        {options.map(item => <button className="button secondary" key={item.id}
          disabled={connecting} onClick={async () => {
            try { setError(''); await connect(item); setOpen(false); }
            catch (e) { setError((e as Error).message); }
          }}>{item.name}</button>)}
        {!options.length && <small>Install or unlock a browser wallet to connect.</small>}
        {error && <small className="error">{error.slice(0, 200)}</small>}
        <small>Browser extension wallets only. WalletConnect QR is not enabled in this release.</small>
      </div>}
    </div>
  );
}
