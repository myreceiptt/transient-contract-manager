import { Suspense } from 'react';
import { Erc721Workspace } from '@/components/erc721-workspace';
import { Loading } from '@/components/shell';
export default function Erc721ManagePage(){
  return <Suspense fallback={<Loading label="Opening 1 of 1 collection…" />}>
    <Erc721Workspace/>
  </Suspense>;
}
