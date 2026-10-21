'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ScanLine,
  BookOpen,
  ArrowUpRight,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { WalletButton } from './providers';
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            t<span>↗</span>
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
          <span className="endhonesa">
            ENDHONESA<span>®</span>
          </span>
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
          <span>TRANSIENT CONTRACT MANAGER · BY ENDHONESA</span>
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
