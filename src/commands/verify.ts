import { Command } from 'commander';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { extractZip } from '../utils/archive.js';
import { banner, success, error, info, warn, kvLine, c } from '../utils/ui.js';
import {
  secureJsonParse,
  validateArtifactManifest,
  validateFailureRecord,
} from '../utils/artifact-validation.js';
import {
  SIGNATURE_FILE,
  buildSignedPayload,
  publicKeyFingerprint,
  verifySignature,
  SignatureRecord,
} from '../utils/signing.js';

export const verifyCommand = new Command('verify')
  .description('Verify the Ed25519 signature embedded in a .bug artifact')
  .argument('<artifact>', 'Path to the .bug artifact (.bug file or extracted directory)')
  .option('--json', 'Output structured JSON instead of human-readable text')
  .action(async (artifact: string, options) => {
    const jsonMode = options.json === true;

    if (!fs.existsSync(artifact)) {
      const msg = `Artifact not found: ${artifact}`;
      if (jsonMode) {
        console.log(JSON.stringify({ valid: false, error: msg }));
      } else {
        error(msg);
      }
      process.exit(1);
    }

    if (!jsonMode) banner('Verify');

    const stat = fs.statSync(artifact);
    let targetPath = artifact;
    let tempDir: string | undefined;

    try {
      if (stat.isFile()) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-verify-'));
        targetPath = tempDir;
        await extractZip(artifact, tempDir);
      }

      const sigPath = path.join(targetPath, SIGNATURE_FILE);
      if (!fs.existsSync(sigPath)) {
        const msg = 'No signature.json found — artifact is unsigned.';
        if (jsonMode) {
          console.log(JSON.stringify({ valid: false, signed: false, error: msg }));
        } else {
          warn(msg);
          info(`Re-capture with ${c.cyan('--sign')} to produce a signed artifact.`);
        }
        process.exit(1);
      }

      const signature: SignatureRecord = JSON.parse(fs.readFileSync(sigPath, 'utf-8'));

      const manifestRaw = fs.readFileSync(path.join(targetPath, 'manifest.json'), 'utf-8');
      const failureRaw = fs.readFileSync(path.join(targetPath, 'failure.json'), 'utf-8');
      const filesJsonPath = path.join(targetPath, 'files.json');
      const fileEntries = fs.existsSync(filesJsonPath)
        ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf-8'))
        : [];

      const manifest = validateArtifactManifest(secureJsonParse(manifestRaw, 'manifest.json'));
      const failure = validateFailureRecord(secureJsonParse(failureRaw, 'failure.json'));
      const { payload } = buildSignedPayload({ manifest, failure, fileEntries });

      const result = verifySignature(signature, payload);
      const fp = publicKeyFingerprint(signature.public_key);

      if (jsonMode) {
        console.log(JSON.stringify({
          valid: result.valid,
          signed: true,
          fingerprint: fp,
          signer: signature.signer,
          signed_at: signature.signed_at,
          algorithm: signature.algorithm,
          reason: result.reason,
        }, null, 2));
        process.exit(result.valid ? 0 : 2);
      }

      if (result.valid) {
        success(c.bold(c.green('SIGNATURE VALID')));
        console.log();
        kvLine('Algorithm', signature.algorithm);
        kvLine('Fingerprint', fp);
        kvLine('Signed at', signature.signed_at);
        if (signature.signer) kvLine('Signer', signature.signer);
        kvLine('Payload hash', c.dim(signature.payload_hash.slice(0, 24) + '...'));
        console.log();
        info('Artifact contents have not been modified since signing.');
        console.log();
        process.exit(0);
      } else {
        error(c.bold(c.red('SIGNATURE INVALID')));
        console.log();
        kvLine('Reason', result.reason || 'unknown');
        kvLine('Fingerprint', fp);
        if (result.expectedHash && result.actualHash) {
          kvLine('Expected hash', c.dim(result.expectedHash.slice(0, 24) + '...'));
          kvLine('Actual hash', c.dim(result.actualHash.slice(0, 24) + '...'));
        }
        console.log();
        process.exit(2);
      }
    } catch (err) {
      const msg = `Verification error: ${(err as Error).message}`;
      if (jsonMode) {
        console.log(JSON.stringify({ valid: false, error: msg }));
      } else {
        error(msg);
      }
      process.exit(1);
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });