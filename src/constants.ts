export {
  DEFAULT_REQUEST_TIMEOUT,
  SESSION_INIT_TIMEOUT,
  MCP_AUTH_TIMEOUT,
} from './schemas/constants.js';

/** Injected at build time via tsup's `define` option. */
export const SDK_VERSION: string = process.env.SDK_VERSION || 'unknown';

/** Injected into every `initializeSession` call for backend tracking. */
export const SDK_TAG = {
  name: 'sdk' as const,
  metadata: { language: 'typescript' as const, version: SDK_VERSION },
};
