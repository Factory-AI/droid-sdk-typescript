// Source-of-truth mirror of factory-mono-alpha custom-model schemas (symbol-only).
// Verbatim copy of CustomModelBedrockSchema, ManagedCustomModelSchema, and
// CustomModelsSchema from packages/common/src/settings/schema.ts. Ported as-is
// per the no-modification rule (includes apiKey / aws credential fields).
// SandboxModeSchema is colocated here (one-liner from the same settings module).

import { z } from 'zod';

import { ModelProvider, ReasoningEffort, SandboxMode } from './enums.js';

const ReasoningEffortSchema = z.nativeEnum(ReasoningEffort);

export const SandboxModeSchema = z.nativeEnum(SandboxMode);

const CustomModelBedrockSchema = z.object({
  awsProfile: z.string().optional(),
  awsRegion: z.string().min(1).optional(),
  bedrockBaseUrl: z.string().url().optional(),
  awsAuthRefresh: z.string().optional(),
  awsCredentialExport: z.string().optional(),
});

export const ManagedCustomModelSchema = z
  .object({
    model: z.string(),
    id: z.string().optional(),
    index: z.number().optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    provider: z.nativeEnum(ModelProvider),
    displayName: z.string().optional(),
    maxContextLimit: z.number().optional(),
    enableThinking: z.boolean().optional(),
    thinkingMaxTokens: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    reasoningEffort: ReasoningEffortSchema.optional(),
    extraHeaders: z.record(z.string()).optional(),
    extraArgs: z.record(z.unknown()).optional(),
    noImageSupport: z.boolean().optional(),
    bedrock: CustomModelBedrockSchema.optional(),
  })
  .superRefine((model, ctx) => {
    if (model.provider === ModelProvider.BEDROCK_CONVERSE && !model.bedrock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bedrock'],
        message:
          'bedrock-converse custom models require a bedrock configuration block',
      });
      return;
    }
    if (model.bedrock) {
      if (
        model.provider !== ModelProvider.ANTHROPIC &&
        model.provider !== ModelProvider.BEDROCK_CONVERSE
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['provider'],
          message:
            'bedrock custom models require provider "anthropic" or "bedrock-converse"',
        });
      }
      return;
    }
    if (!model.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'baseUrl is required unless bedrock is configured',
      });
    }
    if (!model.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apiKey'],
        message: 'apiKey is required unless bedrock is configured',
      });
    }
  });

export const CustomModelsSchema = z.array(ManagedCustomModelSchema);

export type ManagedCustomModel = z.infer<typeof ManagedCustomModelSchema>;
export type CustomModels = z.infer<typeof CustomModelsSchema>;
