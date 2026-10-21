import { spawn } from 'node:child_process';
try {
  process.loadEnvFile('.env.local');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const env = { ...process.env };
if (env.SITES_MANAGED_LINUX_CONTAINER === '1') {
  env.APP_ORIGIN = 'http://terminal.local:4173';
  env.NEXT_PUBLIC_APP_ORIGIN = env.APP_ORIGIN;
  env.NODE_USE_ENV_PROXY = '1';
}
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '0.0.0.0',
    ...process.argv
      .slice(2)
      .filter((a) => a !== '--strictPort')
      .map((a) => (a === '--host' ? '--hostname' : a)),
  ],
  { stdio: 'inherit', env },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
