import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  assetIntegrityError,
  isRuntimeIntegrityMessage,
  resetIntegrityDisabledWarning,
  resolveIntegrityDigests,
  sha256Sri,
  verifyAssetBytes,
} from './integrity.ts';
import { isRuntimeAssetMessage, runtimeAssetError } from './runtime.ts';
import { RUNTIME_ASSET_DIGESTS } from './runtime-manifest.ts';
import { WavelengthError } from '@lightninglabs/wavelength-core';

// The NIST test vector for SHA-256("abc"), in SRI form.
const ABC = new TextEncoder().encode('abc').buffer as ArrayBuffer;
const ABC_SRI = 'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=';

describe('integrity helpers', () => {
  afterEach(() => {
    mock.restoreAll();
    resetIntegrityDisabledWarning();
  });

  it('computes the SRI digest of a known vector', async () => {
    assert.equal(await sha256Sri(ABC), ABC_SRI);
  });

  it('accepts bytes that match the pinned digest', async () => {
    await verifyAssetBytes(ABC, 'wasm_exec.js', 'https://x/wasm_exec.js', {
      'wasm_exec.js': ABC_SRI,
    });
  });

  it('rejects tampered bytes with asset_integrity_failed', async () => {
    const err = await verifyAssetBytes(
      new TextEncoder().encode('abd').buffer as ArrayBuffer,
      'wasm_exec.js',
      'https://x/wasm_exec.js',
      { 'wasm_exec.js': ABC_SRI },
    ).then(
      () => assert.fail('expected rejection'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof WavelengthError);
    assert.equal(err.code, 'asset_integrity_failed');
    assert.match(err.message, /https:\/\/x\/wasm_exec\.js/);
    assert.match(err.message, new RegExp(ABC_SRI.replace(/[+/=]/g, '.')));
  });

  it('rejects an asset with no pinned digest (fails closed)', async () => {
    const err = await verifyAssetBytes(ABC, 'rogue.js', 'https://x/rogue.js', {
      'wasm_exec.js': ABC_SRI,
    }).then(
      () => assert.fail('expected rejection'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof WavelengthError);
    assert.equal(err.code, 'asset_integrity_failed');
  });

  it('keeps the integrity and asset-load message phrases disjoint', () => {
    const integrity = assetIntegrityError('https://x/a.js', 'sha256-abc');
    const load = runtimeAssetError('https://x/a.js');
    assert.equal(isRuntimeIntegrityMessage(integrity.message), true);
    assert.equal(isRuntimeAssetMessage(integrity.message), false);
    assert.equal(isRuntimeIntegrityMessage(load.message), false);
    assert.equal(isRuntimeAssetMessage(load.message), true);
  });

  it('resolves the pinned table when integrity is on or unset', () => {
    const warn = mock.method(console, 'warn', () => undefined);
    assert.equal(resolveIntegrityDigests(undefined), RUNTIME_ASSET_DIGESTS);
    assert.equal(resolveIntegrityDigests(true), RUNTIME_ASSET_DIGESTS);
    assert.equal(warn.mock.callCount(), 0);
  });

  it('resolves null and warns exactly once when disabled', () => {
    const warn = mock.method(console, 'warn', () => undefined);
    assert.equal(resolveIntegrityDigests(false), null);
    assert.equal(resolveIntegrityDigests(false), null);
    assert.equal(warn.mock.callCount(), 1);
    assert.match(
      String(warn.mock.calls[0]?.arguments[0]),
      /integrity verification is disabled/i,
    );
  });
});
