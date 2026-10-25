'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ScanLine,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { WalletButton } from './providers';
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol nota-brand-symbol">
            <Image src="/brand/prof-nota/1.47.png" width={513} height={513}
              alt="" aria-hidden="true" unoptimized />
          </span>
          <span>
            transient<span className="brand-sub">CONTRACT MANAGER</span>
          </span>
        </Link>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav>
          <Link href="/" className={path === '/' || path === '/manage' ? 'active' : ''}>
            <LayoutDashboard size={18} />
            Collections
          </Link>
          <Link href="/checker" className={path === '/checker' ? 'active' : ''}>
            <ScanLine size={18} />
            Contract Checker
          </Link>
          <Link href="/guide" className={path === '/guide' ? 'active' : ''}>
            <BookOpen size={18} />
            Guide & network status
          </Link>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>Authority stays on-chain.</strong>
          <p>
            Your wallet. Your contracts.
            <br />
            One shared workspace.
          </p>
        </div>
        <div className="sidebar-footer">
          <a className="nota-operator-mark" href="https://nota.endhonesa.com"
            target="_blank" rel="noopener noreferrer" aria-label="Prof. NOTA on ENDHONESA">
            <Image src="/brand/prof-nota/1.48.png" width={1167} height={154}
              alt="ENDHONESA" unoptimized />
          </a>
          <p>Independent tools for sovereign creators.</p>
          <a href="https://github.com/Transient-Labs" target="_blank" rel="noreferrer">
            Protocol source <ArrowUpRight size={13} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>{' '}
            {path.startsWith('/mint/')
              ? 'Public mint'
              : path === '/checker'
                ? 'Contract Checker'
                : path === '/manage'
                  ? 'Collection management'
                  : path === '/guide'
                    ? 'Guide'
                    : 'Collections'}
          </span>
          <WalletButton />
        </header>
        <main>{children}</main>
        <footer className="page-footer">
          <span className="footer-identity">
            TRANSIENT CONTRACT MANAGER · BY
            <a href="https://nota.endhonesa.com" target="_blank"
              rel="noopener noreferrer" aria-label="Prof. NOTA Inc. — project operator">
              <Image src="/brand/prof-nota/prof-nota-typhography-2.png"
                width={1920} height={354} alt="Prof. NOTA Inc."
                unoptimized />
            </a>
          </span>
          <span>Independent application. Not operated by Transient Labs.</span>
        </footer>
      </div>
    </div>
  );
}
export function Notice({
  children,
  type = 'info',
}: {
  children: React.ReactNode;
  type?: 'info' | 'error' | 'success';
}) {
  return (
    <div className={'notice ' + type} role={type === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function Loading({ label = 'Reading verified contracts…' }: { label?: string }) {
  return (
    <div className="loading">
      <span className="spinner" />
      {label}
    </div>
  );
}
