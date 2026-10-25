'use client';
import { useState } from 'react';
import { useConnection } from './providers';
import { targetChains, GO1, explorer, localChain } from '@/lib/chains';
import { api } from '@/lib/api-client';
import { Notice, Loading } from './shell';
export function ContractFacts({ info }: { info: any }) {
  return (
    <div className="facts">
      <div className="section-top">
        <h2>
          {info.name} <span className="muted">{info.symbol}</span>
        </h2>
        <span className="tag success">VERIFIED IMPLEMENTATION</span>
      </div>
      <dl>
        <dt>Collection</dt>
        <dd className="mono">
          <a href={explorer(info.chainId, info.address)} target="_blank" rel="noreferrer">
            {info.address} ↗
          </a>
        </dd>
        <dt>Implementation</dt>
        <dd className="mono">
          {info.implementation} · v{info.version}
        </dd>
        <dt>Owner</dt>
        <dd className="mono">{info.owner}</dd>
        <dt>Admins</dt>
        <dd>
          {info.admins.length
            ? info.admins.map((a: string) => (
                <div key={a} className="mono">
                  {a}
                </div>
              ))
            : 'No additional admins'}
        </dd>
        <dt>Token IDs created</dt>
        <dd>
          {info.tokenTypes} <small>Distinct token types, not minted units.</small>
        </dd>
        <dt>Royalty for token {info.tokenId}</dt>
        <dd>
          {Number(info.royalty[1]) / 100}% → <span className="mono">{info.royalty[0]}</span>
        </dd>
        <dt>Stacks mint permission</dt>
        <dd>{info.sale?.approved ? 'Approved' : 'Not approved or not verified'}</dd>
        <dt>Read block</dt>
        <dd className="mono">
          {info.blockNumber} · {info.blockHash}
        </dd>
        <dt>Observed</dt>
        <dd>{new Date(info.observedAt).toLocaleString()}</dd>
      </dl>
      {info.saleError && <Notice type="error">{info.saleError}</Notice>}
    </div>
  );
}
export function Checker() {
  const [chainId, setChainId] = useState(1);
  const [contract, setContract] = useState(GO1 as string);
  const [info, setInfo] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { address } = useConnection();
  return (
    <>
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">READ-ONLY INSPECTION</div>
          <h1>Contract Checker</h1>
          <p className="lead">See what the chain says. No wallet signature required.</p>
        </div>
      </div>
      <section className="panel">
        <form
          className="checker-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setInfo(undefined);
            try {
              setInfo(await api('inspect', { chainId, contract, wallet: address }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
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
            Contract address
            <input
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              required
              spellCheck={false}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? 'Checking…' : 'Inspect contract'}
          </button>
        </form>
        {error && <Notice type="error">{error}</Notice>}
        {busy && <Loading />}
        {info && <ContractFacts info={info} />}
      </section>
    </>
  );
}
