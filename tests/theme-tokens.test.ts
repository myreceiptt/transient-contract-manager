import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const theme = css.slice(css.indexOf('/* Prof. NOTA monochrome identity'));

describe('Prof. NOTA monochrome design tokens', () => {
  it('preserves the documented palette and dark browser controls', () => {
    for (const hex of ['#000000', '#101011', '#161618', '#35353a', '#a1a1aa', '#f4f4f5', '#ffffff']) {
      expect(theme.toLowerCase()).toContain(hex);
    }
    expect(theme).toContain('color-scheme: dark');
  });
  it('styles application navigation, forms, previews and dialogs', () => {
    for (const selector of ['.sidebar', '.topbar', '.panel', '.button', 'input, select, textarea', '.tabs button.active', '.mint-preview', '.review-modal', '.wallet-popover']) {
      expect(theme).toContain(selector);
    }
  });
  it('provides explicit focus states and higher-contrast preferences', () => {
    expect(theme).toContain('button:focus-visible');
    expect(theme).toContain('@media (prefers-contrast: more)');
  });
});
