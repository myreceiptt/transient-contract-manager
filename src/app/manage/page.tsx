import { Suspense } from 'react';
import { Manager } from '@/components/manager';
import { Loading } from '@/components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Manager />
    </Suspense>
  );
}
