/**
 * Protocol version constants for the Factory Droid SDK.
 */

/** JSON-RPC protocol version. */
export const JSONRPC_VERSION = '2.0' as const;

/**
 * Legacy Factory API version for backward compatibility.
 * @deprecated Use FACTORY_PROTOCOL_VERSION for runtime compatibility instead.
 */
export const LEGACY_FACTORY_API_VERSION = '1.0.0' as const;

/** Current Factory protocol version. */
export const FACTORY_PROTOCOL_VERSION = '1.2.0' as const;

/** HTTP header identifying the Factory client type. */
export const FACTORY_CLIENT_HEADER = 'X-Factory-Client' as const;

/** HTTP header identifying the Factory client version. */
export const FACTORY_CLIENT_VERSION = 'X-Client-Version' as const;

/** Default request timeout in milliseconds (30s). */
export const DEFAULT_REQUEST_TIMEOUT = 30_000;

/** Session initialization timeout in milliseconds (60s). */
export const SESSION_INIT_TIMEOUT = 60_000;

/** MCP authentication timeout in milliseconds (300s). */
export const MCP_AUTH_TIMEOUT = 300_000;

/** Compaction timeout in milliseconds (240s — LLM summarization of full conversation). */
export const COMPACTION_TIMEOUT = 240_000;

/** Rewind timeout in milliseconds (60s — file restore + session fork). */
export const REWIND_TIMEOUT = 60_000;
