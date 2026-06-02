// Source-of-truth mirror of factory-mono-alpha session schemas (symbol-only).
// Faithful copies of:
//   SessionTagSchema           — packages/common/src/session/tags/schema.ts
//   MissionSessionTagMetadata  — packages/common/src/session/tags/schema.ts
//   TokenUsageSchema           — packages/common/src/session/settings/schema.ts
// Only the leaf, zero-coupling symbols are mirrored here (not the full files).

import { z } from 'zod';

import type { DecompSessionType } from './enums.js';

export const SessionTagSchema = z.object({
  name: z.string().min(1),
  metadata: z.record(z.string()).optional(),
});

export type SessionTag = z.infer<typeof SessionTagSchema>;

export interface MissionSessionTagMetadata {
  role: DecompSessionType;
  missionId: string;
}

/**
 * Token usage schema for session settings.
 * Tracks LLM token consumption for a session.
 */
export const TokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheCreationTokens: z.number(),
    cacheReadTokens: z.number(),
    thinkingTokens: z.number(),
    factoryCredits: z.number().optional(),
  })
  .strip();

export type TokenUsage = z.infer<typeof TokenUsageSchema>;
