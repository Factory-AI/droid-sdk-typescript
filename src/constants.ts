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
} from "./schemas/constants.js";
