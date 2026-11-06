import { PublicMint } from '@/components/public-mint';
import { Go721PublicMint } from '@/components/go721-public-mint';
import { permanentRedirect } from 'next/navigation';
import { resolveMintPageAlias } from '@/server/db';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if(slug==='go-one-of-one')return <Go721PublicMint/>;
  const canonical = await resolveMintPageAlias(slug);
  if (canonical) permanentRedirect('/mint/' + canonical);
  return <PublicMint slug={slug} />;
}
