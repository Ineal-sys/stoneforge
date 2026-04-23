/**
 * Identity Commands - Identity management and whoami
 *
 * Provides CLI commands for identity operations:
 * - whoami: Show current actor context
 * - identity: Parent command for identity operations
 * - sign: Sign data using a private key
 * - verify: Verify a signature against data
 * - keygen: Generate a new Ed25519 keypair
 */

import { readFileSync } from 'node:fs';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getOutputMode } from '../formatter.js';
import { t } from '../i18n/index.js';
import { getValue, getValueSource, loadConfig } from '../../config/index.js';
import {
  IdentityMode,
  ActorSource,
  signEd25519,
  verifyEd25519Signature,
  generateEd25519Keypair,
  constructSignedData,
  hashRequestBody,
  isValidPublicKey,
  isValidSignature,
  isValidRequestHash,
  type PublicKey,
  type Signature,
} from '../../systems/identity.js';
import type { Timestamp } from '@stoneforge/core';
import type { ConfigSource } from '../../config/types.js';

// ============================================================================
// Actor Resolution Helper
// ============================================================================

/**
 * Result of resolving the current actor
 */
interface ActorResolution {
  /** The resolved actor name */
  actor: string;
  /** Where the actor came from */
  source: ActorSource | ConfigSource;
  /** Whether the actor is verified (always false in soft mode) */
  verified: boolean;
  /** The identity mode */
  mode: IdentityMode;
  /** Additional details */
  details?: {
    /** Config file path if actor from config */
    configPath?: string;
    /** Environment variable name if from env */
    envVar?: string;
  };
}

/**
 * Resolves the current actor from various sources
 *
 * Priority order (highest to lowest):
 * 1. CLI --actor flag
 * 2. STONEFORGE_ACTOR environment variable
 * 3. Config file actor setting
 * 4. Default fallback
 */
function resolveCurrentActor(options: GlobalOptions): ActorResolution {
  // Load config with CLI overrides
  const cliOverrides = options.actor ? { actor: options.actor } : undefined;
  loadConfig({ cliOverrides });

  // Get identity mode
  const mode = getValue('identity.mode');

  // Check CLI flag first
  if (options.actor) {
    return {
      actor: options.actor,
      source: ActorSource.CLI_FLAG,
      verified: false,
      mode,
    };
  }

  // Check configured actor
  const configuredActor = getValue('actor');
  if (configuredActor) {
    const source = getValueSource('actor');
    return {
      actor: configuredActor,
      source,
      verified: false,
      mode,
      details: source === 'environment' ? { envVar: 'STONEFORGE_ACTOR' } : undefined,
    };
  }

  // No actor configured - return indication
  return {
    actor: '',
    source: ActorSource.SYSTEM,
    verified: false,
    mode,
  };
}

// ============================================================================
// Whoami Command
// ============================================================================

async function whoamiHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const resolution = resolveCurrentActor(options);
  const mode = getOutputMode(options);

  // Build data object for JSON output
  const data = {
    actor: resolution.actor || null,
    source: resolution.source,
    verified: resolution.verified,
    identityMode: resolution.mode,
    ...(resolution.details && { details: resolution.details }),
  };

  if (mode === 'json') {
    return success(data);
  }

  if (mode === 'quiet') {
    if (!resolution.actor) {
      return failure(t('identity.whoami.error.noActor'), ExitCode.NOT_FOUND);
    }
    return success(resolution.actor);
  }

  // Human-readable output
  if (!resolution.actor) {
    const lines = [
      t('identity.whoami.error.noActorConfigured'),
      '',
      t('identity.whoami.error.setActor'),
      t('identity.whoami.error.setActorCli'),
      t('identity.whoami.error.setActorEnv'),
      t('identity.whoami.error.setActorConfig'),
    ];
    return success(data, lines.join('\n'));
  }

  // Build formatted output
  const lines: string[] = [];
  lines.push(`${t('identity.label.actor')}: ${resolution.actor}`);
  lines.push(`${t('identity.label.source')}: ${formatSource(resolution.source)}`);
  lines.push(`${t('identity.label.identityMode')}: ${resolution.mode}`);
  lines.push(`${t('identity.label.verified')}: ${resolution.verified ? t('label.yes') : t('label.no')}`);

  if (resolution.details?.envVar) {
    lines.push(`${t('identity.label.envVar')}: ${resolution.details.envVar}`);
  }

  return success(data, lines.join('\n'));
}

/**
 * Formats a source value for human display
 */
function formatSource(source: ActorSource | ConfigSource): string {
  switch (source) {
    case ActorSource.CLI_FLAG:
    case 'cli':
      return t('identity.source.cli');
    case ActorSource.CONFIG:
    case 'file':
      return t('identity.source.config');
    case 'environment':
      return t('identity.source.env');
    case ActorSource.EXPLICIT:
      return t('identity.source.explicit');
    case ActorSource.ELEMENT:
      return t('identity.source.element');
    case ActorSource.SYSTEM:
      return t('identity.source.system');
    case 'default':
      return t('identity.source.default');
    default:
      return String(source);
  }
}

export const whoamiCommand: Command = {
  name: 'whoami',
  description: t('identity.whoami.description'),
  usage: 'sf whoami',
  help: t('identity.whoami.help'),
  options: [],
  handler: whoamiHandler as Command['handler'],
};

// ============================================================================
// Identity Parent Command
// ============================================================================

async function identityHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  // If no subcommand, show current identity (same as whoami)
  return whoamiHandler(args, options);
}

// ============================================================================
// Private Key Resolution Helper
// ============================================================================

/**
 * Resolves the private key from CLI options or environment
 *
 * Priority order:
 * 1. --sign-key flag (direct key)
 * 2. --sign-key-file flag (path to key file)
 * 3. STONEFORGE_SIGN_KEY environment variable
 * 4. STONEFORGE_SIGN_KEY_FILE environment variable
 */
function resolvePrivateKey(options: GlobalOptions): { key: string | null; source: string } {
  // Check direct key from CLI
  if (options.signKey) {
    return { key: options.signKey, source: 'cli_flag' };
  }

  // Check key file from CLI
  if (options.signKeyFile) {
    try {
      const key = readFileSync(options.signKeyFile, 'utf8').trim();
      return { key, source: 'cli_file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(t('identity.sign.error.keyFileRead', { message }));
    }
  }

  // Check environment variable for direct key
  const envKey = process.env.STONEFORGE_SIGN_KEY;
  if (envKey) {
    return { key: envKey, source: 'environment' };
  }

  // Check environment variable for key file
  const envKeyFile = process.env.STONEFORGE_SIGN_KEY_FILE;
  if (envKeyFile) {
    try {
      const key = readFileSync(envKeyFile, 'utf8').trim();
      return { key, source: 'environment_file' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(t('identity.sign.error.keyFileReadEnv', { message }));
    }
  }

  return { key: null, source: 'none' };
}

// ============================================================================
// Sign Command
// ============================================================================

interface SignOptions extends GlobalOptions {
  data?: string;
  file?: string;
  hash?: string;
}

const signOptions: CommandOption[] = [
  {
    name: 'data',
    short: 'd',
    description: t('identity.sign.option.data'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('identity.sign.option.file'),
    hasValue: true,
  },
  {
    name: 'hash',
    description: t('identity.sign.option.hash'),
    hasValue: true,
  },
];

async function signHandler(
  _args: string[],
  options: SignOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  // Resolve actor
  const resolution = resolveCurrentActor(options);
  if (!resolution.actor) {
    return failure(
      t('identity.sign.error.actorRequired'),
      ExitCode.VALIDATION
    );
  }

  // Resolve private key
  let keyInfo: { key: string | null; source: string };
  try {
    keyInfo = resolvePrivateKey(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(message, ExitCode.GENERAL_ERROR);
  }

  if (!keyInfo.key) {
    return failure(
      t('identity.sign.error.privateKeyRequired'),
      ExitCode.VALIDATION
    );
  }

  // Get data to sign
  let dataToSign: string;
  let requestHash: string;

  if (options.hash) {
    // Validate pre-computed hash format
    if (!isValidRequestHash(options.hash)) {
      return failure(
        t('identity.sign.error.invalidHash'),
        ExitCode.VALIDATION
      );
    }
    requestHash = options.hash;
  } else if (options.data) {
    // Hash the provided data
    requestHash = await hashRequestBody(options.data);
  } else if (options.file) {
    // Read and hash file contents
    try {
      const fileData = readFileSync(options.file, 'utf8');
      requestHash = await hashRequestBody(fileData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('identity.sign.error.fileRead', { message }), ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure(
      t('identity.sign.error.noData'),
      ExitCode.VALIDATION
    );
  }

  // Create signed data string
  const signedAt = new Date().toISOString() as Timestamp;
  dataToSign = constructSignedData({
    actor: resolution.actor,
    signedAt,
    requestHash,
  });

  // Sign the data
  try {
    const signature = await signEd25519(keyInfo.key, dataToSign);

    const data = {
      signature,
      signedAt,
      actor: resolution.actor,
      requestHash,
      keySource: keyInfo.source,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(signature);
    }

    const lines: string[] = [];
    lines.push(`${t('identity.label.signature')}: ${signature}`);
    lines.push(`${t('identity.label.signedAt')}: ${signedAt}`);
    lines.push(`${t('identity.label.actor')}: ${resolution.actor}`);
    lines.push(`${t('identity.label.requestHash')}: ${requestHash}`);
    lines.push(`${t('identity.label.keySource')}: ${keyInfo.source}`);

    return success(data, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('identity.sign.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const signCommand: Command = {
  name: 'sign',
  description: t('identity.sign.description'),
  usage: 'sf identity sign [options]',
  help: t('identity.sign.help'),
  options: signOptions,
  handler: signHandler as Command['handler'],
};

// ============================================================================
// Verify Command
// ============================================================================

interface VerifyOptions extends GlobalOptions {
  signature?: string;
  data?: string;
  file?: string;
  hash?: string;
  'public-key'?: string;
  'signed-at'?: string;
}

const verifyOptions: CommandOption[] = [
  {
    name: 'signature',
    short: 's',
    description: t('identity.verify.option.signature'),
    hasValue: true,
    required: true,
  },
  {
    name: 'data',
    short: 'd',
    description: t('identity.verify.option.data'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('identity.verify.option.file'),
    hasValue: true,
  },
  {
    name: 'hash',
    description: t('identity.verify.option.hash'),
    hasValue: true,
  },
  {
    name: 'public-key',
    short: 'k',
    description: t('identity.verify.option.publicKey'),
    hasValue: true,
    required: true,
  },
  {
    name: 'signed-at',
    description: t('identity.verify.option.signedAt'),
    hasValue: true,
    required: true,
  },
];

async function verifyHandler(
  _args: string[],
  options: VerifyOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  // Validate required options
  if (!options.signature) {
    return failure(t('identity.verify.error.signatureRequired'), ExitCode.VALIDATION);
  }

  if (!options['public-key']) {
    return failure(t('identity.verify.error.publicKeyRequired'), ExitCode.VALIDATION);
  }

  if (!options['signed-at']) {
    return failure(t('identity.verify.error.signedAtRequired'), ExitCode.VALIDATION);
  }

  // Resolve actor
  const resolution = resolveCurrentActor(options);
  if (!resolution.actor) {
    return failure(
      t('identity.verify.error.actorRequired'),
      ExitCode.VALIDATION
    );
  }

  // Validate signature format
  if (!isValidSignature(options.signature)) {
    return failure(
      t('identity.verify.error.invalidSignature'),
      ExitCode.VALIDATION
    );
  }

  // Validate public key format
  if (!isValidPublicKey(options['public-key'])) {
    return failure(
      t('identity.verify.error.invalidPublicKey'),
      ExitCode.VALIDATION
    );
  }

  // Get request hash
  let requestHash: string;

  if (options.hash) {
    // Validate pre-computed hash format
    if (!isValidRequestHash(options.hash)) {
      return failure(
        t('identity.sign.error.invalidHash'),
        ExitCode.VALIDATION
      );
    }
    requestHash = options.hash;
  } else if (options.data) {
    requestHash = await hashRequestBody(options.data);
  } else if (options.file) {
    try {
      const fileData = readFileSync(options.file, 'utf8');
      requestHash = await hashRequestBody(fileData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('identity.verify.error.fileRead', { message }), ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure(
      t('identity.verify.error.mustProvideData'),
      ExitCode.VALIDATION
    );
  }

  // Construct signed data
  const signedData = constructSignedData({
    actor: resolution.actor,
    signedAt: options['signed-at'] as Timestamp,
    requestHash,
  });

  // Verify the signature
  try {
    const valid = await verifyEd25519Signature(
      options['public-key'] as PublicKey,
      options.signature as Signature,
      signedData
    );

    const data = {
      valid,
      actor: resolution.actor,
      signedAt: options['signed-at'],
      requestHash,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(valid ? 'valid' : 'invalid');
    }

    if (valid) {
      return success(data, t('identity.verify.success.valid'));
    } else {
      return success(data, t('identity.verify.success.invalid'));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('identity.verify.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const verifyCommand: Command = {
  name: 'verify',
  description: t('identity.verify.description'),
  usage: 'sf identity verify [options]',
  help: t('identity.verify.help'),
  options: verifyOptions,
  handler: verifyHandler as Command['handler'],
};

// ============================================================================
// Keygen Command
// ============================================================================

async function keygenHandler(
  _args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  try {
    const keypair = await generateEd25519Keypair();

    const data = {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
    };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      // In quiet mode, return just the public key (safest for scripts)
      return success(keypair.publicKey);
    }

    const lines: string[] = [];
    lines.push(t('identity.keygen.success.generated'));
    lines.push('');
    lines.push(`${t('identity.label.publicKey')}:  ${keypair.publicKey}`);
    lines.push(`${t('identity.label.privateKey')}: ${keypair.privateKey}`);
    lines.push('');
    lines.push(t('identity.keygen.success.important'));
    lines.push('');
    lines.push(t('identity.keygen.success.register'));
    lines.push(`  sf entity register <name> --public-key ${keypair.publicKey}`);
    lines.push('');
    lines.push(t('identity.keygen.success.sign'));
    lines.push('  sf --sign-key <private-key> --actor <name> <command>');

    return success(data, lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('identity.keygen.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const keygenCommand: Command = {
  name: 'keygen',
  description: t('identity.keygen.description'),
  usage: 'sf identity keygen',
  help: t('identity.keygen.help'),
  options: [],
  handler: keygenHandler as Command['handler'],
};

// ============================================================================
// Hash Command
// ============================================================================

interface HashOptions extends GlobalOptions {
  data?: string;
  file?: string;
}

const hashOptions: CommandOption[] = [
  {
    name: 'data',
    short: 'd',
    description: t('identity.hash.option.data'),
    hasValue: true,
  },
  {
    name: 'file',
    short: 'f',
    description: t('identity.hash.option.file'),
    hasValue: true,
  },
];

async function hashHandler(
  _args: string[],
  options: HashOptions
): Promise<CommandResult> {
  const mode = getOutputMode(options);

  let dataToHash: string;

  if (options.data) {
    dataToHash = options.data;
  } else if (options.file) {
    try {
      dataToHash = readFileSync(options.file, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return failure(t('identity.hash.error.fileRead', { message }), ExitCode.GENERAL_ERROR);
    }
  } else {
    return failure(t('identity.hash.error.mustProvide'), ExitCode.VALIDATION);
  }

  try {
    const hash = await hashRequestBody(dataToHash);

    const data = { hash, length: dataToHash.length };

    if (mode === 'json') {
      return success(data);
    }

    if (mode === 'quiet') {
      return success(hash);
    }

    return success(data, t('identity.hash.success', { hash }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(t('identity.hash.error.failed', { message }), ExitCode.GENERAL_ERROR);
  }
}

export const hashCommand: Command = {
  name: 'hash',
  description: t('identity.hash.description'),
  usage: 'sf identity hash [options]',
  help: t('identity.hash.help'),
  options: hashOptions,
  handler: hashHandler as Command['handler'],
};

export const identityCommand: Command = {
  name: 'identity',
  description: t('identity.description'),
  usage: 'sf identity [subcommand]',
  help: t('identity.help'),
  handler: identityHandler as Command['handler'],
  subcommands: {
    whoami: whoamiCommand,
    sign: signCommand,
    verify: verifyCommand,
    keygen: keygenCommand,
    hash: hashCommand,
    mode: {
      name: 'mode',
      description: t('identity.mode.description'),
      usage: 'sf identity mode [mode]',
      help: t('identity.mode.help'),
      options: [],
      handler: async (args: string[], options: GlobalOptions): Promise<CommandResult> => {
        const mode = getOutputMode(options);

        if (args.length === 0) {
          // Show current mode
          loadConfig();
          const currentMode = getValue('identity.mode');
          const source = getValueSource('identity.mode');

          const data = { mode: currentMode, source };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(currentMode);
          }

          return success(data, t('identity.mode.success.show', { mode: currentMode, source }));
        }

        // Set mode
        const newMode = args[0].toLowerCase();
        const validModes = Object.values(IdentityMode);

        if (!validModes.includes(newMode as IdentityMode)) {
          return failure(
            t('identity.mode.error.invalid', { mode: newMode, valid: validModes.join(', ') }),
            ExitCode.VALIDATION
          );
        }

        try {
          const { setValue } = await import('../../config/index.js');
          setValue('identity.mode', newMode as IdentityMode);

          const data = { mode: newMode, previous: getValue('identity.mode') };

          if (mode === 'json') {
            return success(data);
          }

          if (mode === 'quiet') {
            return success(newMode);
          }

          return success(data, t('identity.mode.success.set', { mode: newMode }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return failure(t('identity.mode.error.failed', { message }), ExitCode.GENERAL_ERROR);
        }
      },
    },
  },
};
