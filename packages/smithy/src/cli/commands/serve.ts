/**
 * serve smithy command - Start the Stoneforge smithy server and web dashboard
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from '../i18n/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Command definition for `sf serve smithy`
 */
export const serveSmithyCommand = {
  name: 'serve smithy',
  description: t('serve.smithy.description'),
  usage: 'sf serve smithy [options]',
  options: [
    { name: 'port', short: 'p', description: t('serve.smithy.option.port'), hasValue: true, defaultValue: '3457' },
    { name: 'host', short: 'H', description: t('serve.smithy.option.host'), hasValue: true, defaultValue: 'localhost' },
  ],
  handler: async (_args: string[], options: Record<string, unknown>) => {
    try {
      const { startSmithyServer } = await import('../../server/index.js');

      const port = options.port ? parseInt(String(options.port), 10) : 3457;
      const host = options.host ? String(options.host) : 'localhost';

      // Look for pre-built web assets
      const webRoot = resolve(__dirname, '../../../web');
      const hasWebAssets = existsSync(webRoot);

      const { port: actualPort } = await startSmithyServer({
        port,
        host,
        dbPath: options.db ? String(options.db) : undefined,
        webRoot: hasWebAssets ? webRoot : undefined,
      });

      console.log(t('serve.smithy.running', { host, port: String(actualPort) }));

      // Keep the process alive — never resolve so main() doesn't call process.exit()
      return await new Promise<never>(() => {});
    } catch (error) {
      return {
        exitCode: 1,
        error: t('serve.smithy.failed', { error: error instanceof Error ? error.message : String(error) }),
      };
    }
  },
};

/**
 * Command definition for bare `sf serve` (aliases to `sf serve smithy`)
 */
export const serveCommand = {
  name: 'serve',
  description: t('serve.description'),
  usage: 'sf serve [options]',
  options: serveSmithyCommand.options,
  handler: serveSmithyCommand.handler,
};
