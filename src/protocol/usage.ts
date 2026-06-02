import { z } from 'zod';

/**
 * Token usage schema for tracking LLM token consumption.
 */
export const TokenUsageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheCreationInputTokens: z.number().int(),
  cacheReadInputTokens: z.number().int(),
  thinkingTokens: z.number().int(),
  factoryCredits: z.number().optional(),
});
