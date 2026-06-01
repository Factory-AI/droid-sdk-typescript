// Source-of-truth mirror of factory-mono-alpha protocol constants.
// Faithful copy of:
//   packages/common/src/droid/schemas/constants.ts
//   packages/common/src/droid/constants.ts (LOOP_INTERVAL_POLICY)
// Keep shapes/values identical to the private monorepo to avoid protocol drift.

/**
 * Legacy envelope field for old JSON-RPC peers - `factoryApiVersion` must be set to this value.
 *
 * @deprecated Do not change this value; use `factoryProtocolVersion` for runtime compatibility.
 */
export const LEGACY_FACTORY_API_VERSION = '1.0.0' as const;

export const FACTORY_PROTOCOL_VERSION = '1.62.0' as const;

export const JSONRPC_VERSION = '2.0' as const;

/**
 * Sentinel ModelID value for the Factory routing model. Faithful copy of
 * packages/common/src/llm/constants.ts.
 */
export const FACTORY_ROUTER_MODEL_ID = 'factory-router' as const;

/**
 * Sentinel value used by CompactionModelSchema to mean "use the session's
 * current model for compaction". Faithful copy of
 * packages/common/src/settings/constants.ts.
 */
export const CURRENT_COMPACTION_MODEL = 'current-model';

// Faithful copy of packages/common/src/settings/constants.ts router-rule
// guardrails. Used by ManagedSettingsBaseSchema and FactoryRouterRuleSchema.

/** Sized comparably to a trimmed user message in the classifier context budget. */
export const FACTORY_ROUTER_GUIDANCE_MAX_LENGTH = 2000;
export const FACTORY_ROUTER_RULES_MAX_COUNT = 20;
export const FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH = 300;
export const FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH = 600;

const seconds = (value: number) => value * 1_000;
const minutes = (value: number) => seconds(value * 60);
const hours = (value: number) => minutes(value * 60);

export const LOOP_INTERVAL_POLICY = {
  minMs: seconds(5),
  maxMs: hours(24),
  displayRange: '5s–24h',
  examples: '5s, 5m, 30m, 2h',
} as const;
