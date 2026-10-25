import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Providers, WalletButton } from '../src/components/providers';

describe('injected wallet bridge SSR', () => {
  it('renders a disconnected wallet selector without accessing window or SDKs at module load', () => {
    const markup = renderToStaticMarkup(
      createElement(Providers, null, createElement(WalletButton)),
    );
    expect(markup).toContain('Connect wallet');
    expect(markup).not.toContain('WalletConnect requires');
  });
});
