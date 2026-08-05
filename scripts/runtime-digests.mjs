// Generates and checks RUNTIME_ASSET_DIGESTS in
// packages/web/src/runtime-manifest.ts. `write [dir]` hashes a staged runtime
// asset directory (default: the demo's public/runtime/<pin>/) and rewrites
// the table in place; `check <dir>` hashes a directory and exits non-zero on
// any drift from the committed table. Plain JS on purpose, mirroring
// runtime-version.mjs, so ci.yml's runtime-pin job can run it without a pnpm
// install. Filenames and digests are parsed from the manifest source text, so
// both object literals must keep the shapes the regexes below expect.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runtimeVersion } from './runtime-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = join(
  root,
  'packages',
  'web',
  'src',
  'runtime-manifest.ts',
);

// Extracts the asset filenames from the RUNTIME_ASSETS literal.
export function parseAssetFiles(source) {
  const block = source.match(
    /export const RUNTIME_ASSETS = \{([\s\S]*?)\} as const;/,
  );
  if (!block) {
    throw new Error(`could not parse RUNTIME_ASSETS from ${manifestFile}`);
  }
  const files = [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  if (files.length === 0) {
    throw new Error(`RUNTIME_ASSETS in ${manifestFile} lists no files`);
  }
  return files;
}

// Extracts the committed digest table from the RUNTIME_ASSET_DIGESTS literal.
export function parseDigests(source) {
  const block = source.match(
    /export const RUNTIME_ASSET_DIGESTS[^=]*= \{([\s\S]*?)\};/,
  );
  if (!block) {
    throw new Error(
      `could not parse RUNTIME_ASSET_DIGESTS from ${manifestFile}`,
    );
  }
  return Object.fromEntries(
    [...block[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
  );
}

// SRI-format sha256 digest of a buffer.
export function sriDigest(buffer) {
  return `sha256-${createHash('sha256').update(buffer).digest('base64')}`;
}

function hashDir(dir, files) {
  return Object.fromEntries(
    files.map((f) => [f, sriDigest(readFileSync(join(dir, f)))]),
  );
}

function defaultAssetDir() {
  return join(
    root,
    'apps',
    'web-wallet-demo',
    'public',
    'runtime',
    runtimeVersion(),
  );
}

function write(dir) {
  const source = readFileSync(manifestFile, 'utf8');
  const digests = hashDir(dir, parseAssetFiles(source));
  const table = Object.entries(digests)
    .map(([name, digest]) => `  '${name}': '${digest}',`)
    .join('\n');
  const updated = source.replace(
    /(export const RUNTIME_ASSET_DIGESTS[^=]*= \{)[\s\S]*?(\};)/,
    `$1\n${table}\n$2`,
  );
  writeFileSync(manifestFile, updated);
  console.log(
    `wrote ${Object.keys(digests).length} digests from ${dir} to ${manifestFile}`,
  );
}

function check(dir) {
  const source = readFileSync(manifestFile, 'utf8');
  const files = parseAssetFiles(source);
  const committed = parseDigests(source);
  const actual = hashDir(dir, files);
  const drift = files.filter((f) => committed[f] !== actual[f]);
  if (drift.length > 0) {
    for (const f of drift) {
      console.error(
        `digest drift for ${f}: committed ${committed[f] ?? '(missing)'}, ` +
          `assets ${actual[f]}`,
      );
    }
    console.error(
      'RUNTIME_ASSET_DIGESTS does not match this asset set; regenerate it ' +
        'with `pnpm gen:runtime-digests` against the published release assets.',
    );
    process.exit(1);
  }
  console.log(`all ${files.length} digests match ${dir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, dir] = process.argv.slice(2);
  if (mode === 'write') {
    write(dir ?? defaultAssetDir());
  } else if (mode === 'check' && dir) {
    check(dir);
  } else {
    console.error(
      'usage: node scripts/runtime-digests.mjs write [assetDir] | check <assetDir>',
    );
    process.exit(2);
  }
}
