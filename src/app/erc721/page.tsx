import { Suspense } from 'react';
import { Erc721Inspector } from '@/components/erc721-inspector';
import { Loading } from '@/components/shell';
export default function Erc721Page(){
  return <Suspense fallback={<Loading label="Opening ERC721TL inspector…"/>}>
    <Erc721Inspector/>
  </Suspense>;
}
