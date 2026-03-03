/**
 * Ambient module declarations for @stoneforge/smithy optional peer dependency.
 *
 * Quarry dynamically imports smithy at runtime (with try/catch guards) for CLI
 * commands that need settings or server functionality. These declarations let
 * TypeScript resolve the imports without an actual package dependency, which
 * would create a cyclic dependency in the build graph (quarry ↔ smithy).
 */

declare module '@stoneforge/smithy/services' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createSettingsService(storage: any): any;
}

declare module '@stoneforge/smithy/server' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function startSmithyServer(options?: any): Promise<any>;
}
