'use client';
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, ArrowRight, Box, ShieldCheck, Globe2, Check } from 'lucide-react';
import { useConnection } from './providers';
import { targetChains, localChain } from '@/lib/chains';
import { api } from '@/lib/api-client';
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
        <div className="nota-hero-identity" aria-label="Prof. NOTA. OiOi. Build with intention.">
          <Image src="/brand/prof-nota/beware-of-scams.png"
            width={1063} height={1063} alt="" aria-hidden="true" unoptimized />
          <span>OiOi. <small>BUILD WITH INTENTION.</small></span>
        </div>
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
        <section className="reference-panel nota-profile-feature" aria-labelledby="nota-feature-heading">
          <div className="section-top">
            <span className="section-number">MEET THE PEOPLE BEHIND THE WORKSPACE</span>
            <span className="tag light">PROF. NOTA INC.</span>
          </div>
          <div className="nota-feature-art">
            <Image src="/brand/prof-nota/beware-of-scams.png" alt="Prof. NOTA portrait"
              width={1063} height={1063} unoptimized />
            <div className="nota-feature-wordmark">
              <Image src="/brand/prof-nota/prof-nota-typhography-2.png"
                width={1920} height={354} alt="Prof. NOTA Inc." unoptimized />
              <span>AN INDEPENDENT CREATIVE TECHNOLOGY STUDIO</span>
            </div>
          </div>
          <div className="nota-feature-content">
            <h2 id="nota-feature-heading">Meet Prof. NOTA.</h2>
            <p>Curious about the people, ideas and independent work behind this application?
              Explore Prof. NOTA and Prof. NOTA Inc. through their story.</p>
            <a className="button wide nota-profile-link"
              href="https://nota.endhonesa.com/profile"
              target="_blank" rel="noopener noreferrer">
              Discover our story <ArrowUpRight size={18} />
            </a>
          </div>
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
      <section className="nota-builder-signature" aria-label="Built by Prof. NOTA">
        <div>
          <span className="eyebrow">AN INDEPENDENT ENDHONESA APPLICATION</span>
          <p>Built by Prof. NOTA Inc. Protocol contracts remain independently verified.</p>
        </div>
        <a href="https://nota.endhonesa.com" target="_blank" rel="noopener noreferrer"
          aria-label="Visit Prof. NOTA">
          <Image src="/brand/prof-nota/prof-nota-typhography-1.png"
            width={1920} height={1181} alt="Prof. NOTA Inc." unoptimized />
        </a>
      </section>
    </>
  );
}
