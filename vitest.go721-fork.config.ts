import {resolve} from 'node:path';
import {defineConfig} from 'vitest/config';
export default defineConfig({
  resolve:{alias:{'@':resolve(process.cwd(),'src')}},
  test:{
    include:['scripts/go721-local-fork.spec.ts'],
    hookTimeout:210000,
    testTimeout:210000,
    fileParallelism:false,
  },
});
