import { PublicMint } from '@/components/public-mint';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicMint slug={slug} />;
}
