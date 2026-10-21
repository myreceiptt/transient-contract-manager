import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import './globals.css';
export const metadata: Metadata = {
  title: 'Transient Contract Manager · ENDHONESA',
  description:
    'Independent, non-custodial management for Transient Labs NFT contracts. Shared workspaces and independent mint pages.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
