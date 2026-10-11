import {
  constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, linkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EvidenceBundle, VerifyReport } from '@horkos/sdk';
import { verifyTripwireBundle } from './score/model.js';

export const BUNDLE_ID = /^0x[0-9a-f]{64}$/i;
export const MAX_BUNDLE_BYTES = 64 * 1024;

function object(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function uint(value: unknown, bits = 256): boolean {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value)
    && BigInt(value) < (1n << BigInt(bits));
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Closed public schema: no unknown fields, secrets, arbitrary nested data or paths. */
export function verifyPublicBundle(value: unknown): { bundle: EvidenceBundle; report: VerifyReport } {
  const invalid = () => { throw new Error('Invalid public evidence schema'); };
  if (!object(value, ['version', 'chainId', 'registry', 'verdictId', 'normalizedEvent', 'features', 'model', 'verdict', 'signature'])) invalid();
  const bundle = value as unknown as EvidenceBundle;
  const hex32 = (v: unknown) => typeof v === 'string' && BUNDLE_ID.test(v);
  const address = (v: unknown) => typeof v === 'string' && /^0x[0-9a-f]{40}$/i.test(v);
  const event = bundle.normalizedEvent;
  const verdict = bundle.verdict;
  const model = bundle.model;
  if (bundle.version !== 1 || !integer(bundle.chainId) || bundle.chainId === 0
    || !address(bundle.registry) || !hex32(bundle.verdictId)
    || !object(event, ['routeId', 'amount', 'sourceChainId', 'targetChainId', 'recipient', 'timestamp', 'nonce'])
    || !hex32(event.routeId) || !uint(event.amount) || !uint(event.sourceChainId) || !uint(event.targetChainId)
    || !address(event.recipient) || !integer(event.timestamp) || !uint(event.nonce, 64)
    || !object(bundle.features, ['proofMismatch', 'unbackedPayout', 'velocitySurgeBps', 'counterpartyFlagged', 'sizeRatioBps'])
    || !object(model, ['name', 'version', 'hash'], ['sourceRef'])
    || model.name !== 'tripwire-rules' || !['1.0.0', '2.0.0'].includes(model.version) || !hex32(model.hash)
    || !object(verdict, ['agentId', 'scoreBps', 'policyId', 'observedAt', 'expiry', 'nonce'])
    || !uint(verdict.agentId) || !uint(verdict.nonce, 64) || !integer(verdict.scoreBps) || verdict.scoreBps > 10000
    || !hex32(verdict.policyId) || !integer(verdict.observedAt) || !integer(verdict.expiry)
    || verdict.expiry <= verdict.observedAt || verdict.observedAt !== event.timestamp || verdict.nonce !== event.nonce
    || !object(bundle.signature, ['r', 's', 'keyX', 'keyY'])
    || !Object.values(bundle.signature).every(hex32)) invalid();
  if (model.sourceRef !== undefined) {
    if (typeof model.sourceRef !== 'string' || model.sourceRef.length > 512) invalid();
    const source = new URL(model.sourceRef);
    if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash) invalid();
  }
  const report = verifyTripwireBundle(bundle);
  return { bundle, report };
}

export interface BundleStore {
  get(id: string): EvidenceBundle | undefined;
  set(id: string, bundle: EvidenceBundle): void;
  has(id: string): boolean;
  keys(): string[];
}

export class MemoryBundleStore implements BundleStore {
  private bundles = new Map<string, EvidenceBundle>();
  constructor(readonly capacity = 512) {}

  get(id: string) { const value = this.bundles.get(id.toLowerCase()); return value && structuredClone(value); }
  has(id: string) { return this.bundles.has(id.toLowerCase()); }
  keys() { return [...this.bundles.keys()]; }

  protected check(id: string, bundle: EvidenceBundle) {
    if (!BUNDLE_ID.test(id) || id.toLowerCase() !== bundle.verdictId.toLowerCase()) throw new Error('Invalid bundle ID');
    if (Buffer.byteLength(JSON.stringify(bundle)) > MAX_BUNDLE_BYTES) throw new Error('Bundle too large');
    if (!verifyPublicBundle(bundle).report.valid) throw new Error('Evidence verification failed');
    const previous = this.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(bundle)) throw new Error('Bundle ID already stored');
    if (!previous && this.bundles.size >= this.capacity) throw new Error('Evidence storage capacity reached');
  }

  set(id: string, bundle: EvidenceBundle) {
    this.check(id, bundle);
    this.bundles.set(id.toLowerCase(), structuredClone(bundle));
  }
}

export class DiskBundleStore extends MemoryBundleStore {
  readonly directory: string;
  rejectedFiles = 0;

  constructor(directory: string, capacity = 512) {
    super(capacity);
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (lstatSync(this.directory).isSymbolicLink() || !lstatSync(this.directory).isDirectory()) {
      throw new Error('Evidence directory must be a regular directory');
    }
    for (const name of readdirSync(this.directory)) {
      if (!/^0x[0-9a-f]{64}\.json$/.test(name)) continue;
      try {
        const bundle = readPublicBundleFile(resolve(this.directory, name));
        super.set(name.slice(0, -5), bundle);
      } catch { this.rejectedFiles++; }
    }
  }

  override set(id: string, bundle: EvidenceBundle) {
    this.check(id, bundle);
    if (this.has(id)) return;
    const target = resolve(this.directory, `${id.toLowerCase()}.json`);
    if (existsSync(target) || lstatSync(this.directory).isSymbolicLink()) throw new Error('Unsafe evidence storage target');
    const temporary = resolve(this.directory, `.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(bundle) + '\n', { flag: 'wx', mode: 0o600 });
      linkSync(temporary, target);
      super.set(id, bundle);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}

export function readPublicBundleFile(path: string): EvidenceBundle {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) throw new Error('Invalid evidence file');
    const { bundle, report } = verifyPublicBundle(JSON.parse(readFileSync(fd, 'utf8')));
    if (!report.valid) throw new Error('Evidence verification failed');
    return bundle;
  } finally { closeSync(fd); }
}
