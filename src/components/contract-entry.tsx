'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowRight, Box, ShieldCheck, Globe2, Check } from 'lucide-react';
import { useConnection } from './providers';
import { targetChains, localChain, GO1 } from '@/lib/chains';
import { api, short } from '@/lib/api-client';
import { Notice, Loading } from './shell';
export function ContractEntry() {
  const [chainId, setChainId] = useState(1);
  const [contract, setContract] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { address } = useConnection();
  async function open(c = contract, id = chainId) {
    setBusy(true);
    setError('');
    try {
      await api('inspect', { chainId: id, contract: c, wallet: address });
      router.push(`/manage?chain=${id}&contract=${c.toLowerCase()}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-square" /> THE CREATOR WORKSPACE
          </div>
          <h1>
            Your contracts.
            <br />
            <span className="muted-heading">Your control.</span>
          </h1>
          <p className="lead">
            Manage existing collections, work together, and give every drop
            <br className="desktop-only" /> a home of its own.
          </p>
        </div>
        <span className="header-stamp">
          OiOi.
          <br />
          <small>BUILD WITH INTENTION.</small>
        </span>
      </div>
      <div className="intro-grid">
        <section className="panel connect-panel">
          <div className="section-top">
            <span className="section-number">01 / GET STARTED</span>
            <ShieldCheck size={19} />
          </div>
          <h2>Open a collection</h2>
          <p>Connect as an owner or admin. Your on-chain role is your access.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              open();
            }}
          >
            <label>
              Network
              <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
                {[
                  ...targetChains,
                  ...(process.env.NEXT_PUBLIC_LOCAL_CHAIN_ENABLED === 'true' ? [localChain] : []),
                ].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collection contract address
              <input
                value={contract}
                onChange={(e) => setContract(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                required
              />
            </label>
            <button className="button wide" disabled={busy}>
              {busy ? 'Checking contract…' : 'Start managing'}
              <ArrowRight size={17} />
            </button>
          </form>
          {error && <Notice type="error">{error}</Notice>}
          <small className="fineprint">
            Existing contracts stay exactly where they are. Nothing is redeployed.
          </small>
        </section>
        <section className="reference-panel">
          <div className="section-top">
            <span className="section-number">REFERENCE COLLECTION</span>
            <span className="tag light">ETHEREUM</span>
          </div>
          <div className="reference-art">
            <div className="line-art">
              <span className="oil-ring" />
              <span className="oil-line" />
              <span className="oil-tag">
                GO<span>1</span>
              </span>
            </div>
            <span className="art-caption">GANTI OLI #1 / CONTRACT WORKSPACE</span>
          </div>
          <div className="reference-bottom">
            <div>
              <h2>Ganti Oli #1</h2>
              <p>ERC-1155 · {short(GO1)}</p>
            </div>
            <button
              className="icon-button"
              aria-label="Open Ganti Oli #1"
              onClick={() => open(GO1, 1)}
              disabled={busy}
            >
              <ArrowUpRight />
            </button>
          </div>
          <p className="reference-disclaimer">
            Contract identity illustration · NFT artwork is loaded from its metadata.
          </p>
        </section>
      </div>
      <section className="feature-row">
        <article>
          <Box size={22} />
          <div>
            <h3>Existing contracts, direct access</h3>
            <p>Verified implementations. Owner and admin permissions checked on-chain.</p>
          </div>
        </article>
        <article>
          <Globe2 size={22} />
          <div>
            <h3>Your own mint pages</h3>
            <p>
              Independent content, shared drafts, and sales executed by official Stacks contracts.
            </p>
          </div>
        </article>
        <article>
          <ShieldCheck size={22} />
          <div>
            <h3>Review before you sign</h3>
            <p>Simulate each action and inspect its effects before opening your wallet.</p>
          </div>
        </article>
      </section>
      <section className="network-strip">
        <span className="section-number">FOUR TARGET NETWORKS</span>
        <div>
          {targetChains.map((c, i) => (
            <span key={c.id}>
              <i className={'chain-dot c' + i} />
              {c.name}
              <Check size={12} />
            </span>
          ))}
        </div>
        <p>Bytecode matched · public mint execution is subject to the release gate.</p>
      </section>
    </>
  );
}
