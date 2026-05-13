import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { banner, success, error, info, warn, kvLine, c, icons } from '../utils/ui.js';
import {
  generateKeyPair,
  publicKeyFingerprint,
  saveKeyPair,
  KEY_DIR,
  DEFAULT_KEY_NAME,
} from '../utils/signing.js';

export const keygenCommand = new Command('keygen')
  .description('Generate an Ed25519 keypair for signing .bug artifacts')
  .option('-n, --name <name>', 'Key name under ~/.bugproof/keys', DEFAULT_KEY_NAME)
  .option('--force', 'Overwrite existing keys with the same name')
  .action((options) => {
    banner(`${icons.arrow} BugProof Keygen`);

    const pubPath = path.join(KEY_DIR, `${options.name}.pub`);
    const privPath = path.join(KEY_DIR, `${options.name}.key`);

    if (!options.force && (fs.existsSync(pubPath) || fs.existsSync(privPath))) {
      error(`A key named '${options.name}' already exists at ${KEY_DIR}.`);
      info('Pass --force to overwrite, or pick a different --name.');
      process.exit(1);
    }

    const keyPair = generateKeyPair();
    const { pubPath: writtenPub, privPath: writtenPriv } = saveKeyPair(options.name, keyPair);
    const fp = publicKeyFingerprint(keyPair.publicKey);

    success('Generated Ed25519 keypair.');
    kvLine('Public key', writtenPub);
    kvLine('Private key', writtenPriv);
    kvLine('Fingerprint', fp);
    console.log();
    info(`Sign captures with: ${c.cyan(`bugproof capture --sign${options.name === DEFAULT_KEY_NAME ? '' : ' ' + options.name} -- <your command>`)}`);
    info(`Verify artifacts with: ${c.cyan('bugproof verify <artifact>')}`);
    warn('Keep the .key file private. Anyone with it can sign artifacts as you.');
    console.log();
  });