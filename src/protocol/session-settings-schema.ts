// Source-of-truth mirror of packages/common/src/session/settings/schema.ts.
// `TokenUsageSchema` is intentionally imported from `./session.js` (where it
// was previously mirrored verbatim from the same upstream definition) rather
// than redeclared here, to avoid duplicate barrel exports for the same shape.

import { z } from 'zod';

import { ApiProvider, ModelProvider, ReasoningEffort } from './enums.js';
import { TokenUsageSchema } from './session.js';
import { SessionTagSchema } from './session.js';
import {
  CompactionModelSchema,
  SessionDefaultSettingsSchema,
} from './settings.js';

/**
 * Cached pick written once per Factory Router session (or overridden by the
 * upgrade tool). Resumes + sub-agents read it instead of re-routing.
 */
export const EffectiveFactoryRouterModelSchema = z
  .object({
    modelId: z.string(),
    apiProvider: z.nativeEnum(ApiProvider),
    reasoningEffort: z.nativeEnum(ReasoningEffort),
  })
  .strict();

/**
 * Session settings schema.
 * Settings persisted to .settings.json for each session.
 */
export const SessionSettingsSchema = SessionDefaultSettingsSchema.extend({
  providerLock: z.nativeEnum(ModelProvider).optional(),
  providerLockTimestamp: z.string().optional(),
  apiProviderLock: z.nativeEnum(ApiProvider).optional(),
  assistantActiveTimeMs: z.number().optional(),
  tokenUsage: TokenUsageSchema.optional(),
  inclusiveTokenUsage: TokenUsageSchema.optional(),
  childInclusiveTokenUsageBySessionId: z.record(TokenUsageSchema).optional(),

  /**
   * ISO timestamp when the session was archived.
   * Presence indicates archived status (omit to unarchive).
   */
  archivedAt: z.string().optional(),

  /** Session tags for categorization */
  tags: z.array(SessionTagSchema).optional(),

  /** Additional tool IDs enabled for this session */
  enabledToolIds: z.array(z.string()).optional(),

  /** Tool IDs explicitly disabled for this session */
  disabledToolIds: z.array(z.string()).optional(),

  /** Model to use for compaction; "current-model" follows the session/spec model. */
  compactionModel: CompactionModelSchema.optional(),
  /** Whether threshold-based automatic compaction is enabled for this session */
  compactionThresholdCheckEnabled: z.boolean().optional(),

  effectiveFactoryRouterModel: EffectiveFactoryRouterModelSchema.optional(),
});
