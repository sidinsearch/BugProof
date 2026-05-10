/**
 * Cryptographic signing for .bug artifacts (Phase 2.2).
 *
 * Uses Ed25519 (RFC 8032) — fast, deterministic, 64-byte signatures,
 * 32-byte keys, native to Node's built-in crypto (no external deps).
 *
 * Threat model: detect tampering of a shared .bug artifact. We sign the
 * canonical SHA-256 of the artifact's logical state (manifest + failure
 * fingerprint + per-file checksums) so that any change to source files,
 * captured output, or metadata invalidates the signature.
 *
 * Out of scope: identity/PKI. Trust is established by the recipient
 * comparing the embedded public key against a known one (or via gist
 * pinning, key servers, etc.).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { ArtifactManifest } from '../types/artifact.js';
import type { FailureRecord } from '../types/failure.js';
import type { FileEntry } from '../capture/packager.js';

export const SIGNATURE_FILE = 'signature.json';
export const KEY_DIR = path.join(os.homedir(), '.bugproof', 'keys');
export const DEFAULT_KEY_NAME = 'default';

export interface SignatureRecord {
  /** Always 'ed25519' for now — bump when we add new schemes */
  algorithm: 'ed25519';
  /** Schema version of this record */
  version: 1;
  /** Hex-encoded SPKI DER public key (32 bytes raw, plus DER wrapper) */
  public_key: string;
  /** Hex SHA-256 hash of the canonical signed payload */
  payload_hash: string;
  /** Hex Ed25519 signature (128 hex chars / 64 bytes) */
  signature: string;
  /** ISO timestamp of when the signature was created */
  signed_at: string;
  /** Optional human-readable signer identity (e.g. email, gist URL) */
  signer?: string;
}

export interface KeyPair {
  /** Hex-encoded SPKI DER public key */
  publicKey: string;
  /** Hex-encoded PKCS8 DER private key — keep secret */
  privateKey: string;
}

/**
 * Generate a new Ed25519 keypair encoded as hex DER.
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex'),
  };
}

/**
 * Save a keypair to disk with permissive-but-correct permissions.
 *
 * Stores:
 *   ~/.bugproof/keys/<name>.pub      (public key, hex DER)
 *   ~/.bugproof/keys/<name>.key      (private key, hex DER, mode 0600)
 */
export function saveKeyPair(name: string, keyPair: KeyPair): { pubPath: string; privPath: string } {
  fs.mkdirSync(KEY_DIR, { recursive: true });

  const pubPath = path.join(KEY_DIR, `${name}.pub`);
  const privPath = path.join(KEY_DIR, `${name}.key`);

  fs.writeFileSync(pubPath, keyPair.publicKey, 'utf-8');
  fs.writeFileSync(privPath, keyPair.privateKey, 'utf-8');

  // Tighten the private key file. fs.chmodSync is a no-op on Windows
  // (the call still succeeds but ACLs are not modified). The hex content
  // is non-secret-looking; we still set 0600 where the OS honors it.
  try {
    fs.chmodSync(privPath, 0o600);
  } catch {
    // best-effort
  }

  return { pubPath, privPath };
}

/**
 * Load a keypair previously saved with saveKeyPair.
 */
export function loadKeyPair(name: string = DEFAULT_KEY_NAME): KeyPair {
  const pubPath = path.join(KEY_DIR, `${name}.pub`);
  const privPath = path.join(KEY_DIR, `${name}.key`);

  if (!fs.existsSync(privPath)) {
    throw new Error(
      `Private key not found: ${privPath}. ` +
      `Run 'bugproof keygen' to create a default keypair, or provide --key-file.`,
    );
  }
  if (!fs.existsSync(pubPath)) {
    throw new Error(`Public key not found: ${pubPath}.`);
  }

  return {
    publicKey: fs.readFileSync(pubPath, 'utf-8').trim(),
    privateKey: fs.readFileSync(privPath, 'utf-8').trim(),
  };
}

/**
 * Resolve a private key from a path that may point to either a `.key` file
 * or the bare name of a key under `~/.bugproof/keys/`.
 */
export function resolvePrivateKey(keyArg: string): KeyPair {
  // Direct file path?
  if (keyArg.includes(path.sep) || keyArg.endsWith('.key') || fs.existsSync(keyArg)) {
    if (!fs.existsSync(keyArg)) {
      throw new Error(`Key file not found: ${keyArg}`);
    }
    const privateKey = fs.readFileSync(keyArg, 'utf-8').trim();
    // Try to find sibling .pub file
    const pubCandidate = keyArg.replace(/\.key$/, '.pub');
    if (!fs.existsSync(pubCandidate)) {
      throw new Error(
        `Public key file not found alongside private key: expected ${pubCandidate}`,
      );
    }
    const publicKey = fs.readFileSync(pubCandidate, 'utf-8').trim();
    return { publicKey, privateKey };
  }

  // Treat as named key under KEY_DIR
  return loadKeyPair(keyArg);
}

/**
 * Build the canonical payload that gets signed.
 *
 * The payload is a JSON-serialized object with sorted keys, covering every
 * security-relevant field. Any change to the manifest, failure fingerprint,
 * or per-file checksum will invalidate the signature.
 *
 * IMPORTANT: file ordering is by path (alphabetical), so the same logical
 * artifact produces the same signed bytes regardless of FS enumeration order.
 */
export function buildSignedPayload(opts: {
  manifest: ArtifactManifest;
  failure: FailureRecord;
  fileEntries: FileEntry[];
}): { payload: string; payloadHash: string } {
  const sortedFiles = [...opts.fileEntries].sort((a, b) => a.path.localeCompare(b.path));

  const canonical = {
    manifest: opts.manifest,
    failure: {
      fingerprint: opts.failure.fingerprint,
      error_patterns: opts.failure.error_patterns,
      exit_code: opts.failure.exit_code,
    },
    files: sortedFiles.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
  };

  const payload = JSON.stringify(canonical);
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
  return { payload, payloadHash };
}

/**
 * Sign a canonical payload with an Ed25519 private key.
 */
export function signPayload(payload: string, keyPair: KeyPair, signer?: string): SignatureRecord {
  const privKey = crypto.createPrivateKey({
    key: Buffer.from(keyPair.privateKey, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });

  // Ed25519 in Node: sign() with null algorithm and the raw payload.
  const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), privKey);
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  return {
    algorithm: 'ed25519',
    version: 1,
    public_key: keyPair.publicKey,
    payload_hash: payloadHash,
    signature: signature.toString('hex'),
    signed_at: new Date().toISOString(),
    signer,
  };
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  signature?: SignatureRecord;
  expectedHash?: string;
  actualHash?: string;
}

/**
 * Verify a signature against a freshly-recomputed payload.
 *
 * Returns { valid: true } only if:
 *   1. signature record is well-formed,
 *   2. payload hash in record matches the recomputed hash,
 *   3. signature verifies against the embedded public key.
 */
export function verifySignature(
  signature: SignatureRecord,
  payload: string,
): VerifyResult {
  if (signature.algorithm !== 'ed25519') {
    return { valid: false, reason: `Unsupported algorithm: ${signature.algorithm}`, signature };
  }
  if (signature.version !== 1) {
    return { valid: false, reason: `Unsupported signature version: ${signature.version}`, signature };
  }

  const recomputedHash = crypto.createHash('sha256').update(payload).digest('hex');
  if (recomputedHash !== signature.payload_hash) {
    return {
      valid: false,
      reason: 'Payload hash mismatch — artifact contents have been modified since signing',
      signature,
      expectedHash: signature.payload_hash,
      actualHash: recomputedHash,
    };
  }

  try {
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(signature.public_key, 'hex'),
      format: 'der',
      type: 'spki',
    });
    const ok = crypto.verify(
      null,
      Buffer.from(payload, 'utf-8'),
      pubKey,
      Buffer.from(signature.signature, 'hex'),
    );
    if (!ok) {
      return {
        valid: false,
        reason: 'Signature does not match the embedded public key',
        signature,
      };
    }
    return { valid: true, signature, expectedHash: signature.payload_hash, actualHash: recomputedHash };
  } catch (err) {
    return {
      valid: false,
      reason: `Signature verification threw: ${(err as Error).message}`,
      signature,
    };
  }
}

/**
 * Short fingerprint of a public key (first 16 hex chars of SHA-256).
 * Useful for compact display.
 */
export function publicKeyFingerprint(publicKeyHex: string): string {
  return crypto.createHash('sha256').update(publicKeyHex, 'hex').digest('hex').slice(0, 16);
}
