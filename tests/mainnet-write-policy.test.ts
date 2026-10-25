import { afterEach, describe, expect, it } from 'vitest';
import { networkWritePermissions, writesAllowed, requireWrites } from '../src/server/chain';

const original = process.env.MAINNET_WRITES_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.MAINNET_WRITES_ENABLED;
  else process.env.MAINNET_WRITES_ENABLED = original;
});

describe('Explicit operator-controlled write availability', () => {
  it('keeps all public networks disabled until the operator opts into writes', () => {
    process.env.MAINNET_WRITES_ENABLED = 'false';
    for (const chainId of [1, 4663, 8453, 360]) {
      expect(networkWritePermissions[chainId]).toBe(true);
      expect(writesAllowed(chainId)).toBe(false);
      expect(() => requireWrites(chainId)).toThrow(/disabled by the operator/i);
    }
  });
  it('allows the already-verified adapter paths when the operator enables the gate', () => {
    process.env.MAINNET_WRITES_ENABLED = 'true';
    for (const chainId of [1, 4663, 8453, 360]) {
      expect(writesAllowed(chainId)).toBe(true);
      expect(() => requireWrites(chainId)).not.toThrow();
    }
  });
  it('never interprets arbitrary values as enabling mainnet writes', () => {
    for (const value of ['TRUE', 'yes', '1', 'on', 'false', '']) {
      process.env.MAINNET_WRITES_ENABLED = value;
      expect(writesAllowed(1)).toBe(false);
    }
  });
  it('never enables unknown network IDs', () => {
    process.env.MAINNET_WRITES_ENABLED = 'true';
    for (const chainId of [5, 56, 137, 999999]) {
      expect(writesAllowed(chainId)).toBe(false);
    }
  });
});
