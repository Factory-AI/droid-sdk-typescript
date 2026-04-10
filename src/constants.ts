/**
 * Timeout constants for the Factory Droid SDK.
 *
 * Re-exported from schemas/constants.ts to provide a convenient top-level import path.
 * These values control how long the SDK waits for various operations
 * before throwing a TimeoutError.
 */

export {
  DEFAULT_REQUEST_TIMEOUT,
  SESSION_INIT_TIMEOUT,
  MCP_AUTH_TIMEOUT,
} from './schemas/constants.js';

/**
 * SDK version from package.json, injected at build time via tsup's `define` option.
 * Falls back to 'unknown' in unbundled environments (e.g. tests).
 */
export const SDK_VERSION: string = process.env.SDK_VERSION || 'unknown';

/**
 * Tag automatically injected into every `initializeSession` call
 * so the backend can distinguish SDK-created sessions from raw `droid exec` usage.
 */
export const SDK_TAG = {
  name: 'sdk' as const,
  metadata: { language: 'typescript' as const, version: SDK_VERSION },
};
