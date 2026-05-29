// Source-of-truth mirror of factory-mono-alpha session source schemas.
// Faithful copy of packages/common/src/session/sources/schema.ts.

import { z } from 'zod';

import { SessionPlatform } from './enums.js';

// -------------------------------------------------------------
// Platform source schemas (used for messages and sessions)
// -------------------------------------------------------------

const SlackSourceSchema = z.object({
  platform: z.literal(SessionPlatform.Slack),
  teamId: z.string().nullish(),
  channel: z.string().nullish(),
  threadTs: z.string().nullish(),
  userId: z.string().nullish(),
});

const WebSourceSchema = z.object({
  platform: z.literal(SessionPlatform.Web),
});

const ApiSourceSchema = z.object({
  platform: z.literal(SessionPlatform.Api),
});

const SessionsApiSourceSchema = z.object({
  platform: z.literal(SessionPlatform.SessionsApi),
});

const LinearSourceSchema = z.object({
  platform: z.literal(SessionPlatform.Linear),
  agentSessionId: z.string(),
  issueId: z.string().nullish(),
  issueUrl: z.string().nullish(),
  issueIdentifier: z.string().nullish(),
  organizationId: z.string().nullish(),
  userId: z.string().nullish(),
});

const ReadinessRemediationSourceSchema = z.object({
  platform: z.literal(SessionPlatform.ReadinessRemediation),
  reportId: z.string(),
  repoUrl: z.string(),
  criterionId: z.string(),
});

const ReadinessEvaluationSourceSchema = z.object({
  platform: z.literal(SessionPlatform.ReadinessEvaluation),
  repoUrl: z.string(),
});

const AutomationSourceSchema = z.object({
  platform: z.literal(SessionPlatform.Automation),
  automationId: z.string(),
  computerId: z.string(),
});

const WikiGenerationSourceSchema = z.object({
  platform: z.literal(SessionPlatform.WikiGeneration),
  repoUrl: z.string(),
});

const WikiCISetupSourceSchema = z.object({
  platform: z.literal(SessionPlatform.WikiCISetup),
  repoUrl: z.string(),
});

// -------------------------------------------------------------
// Session-specific source schemas (adds delegationSessionId)
// -------------------------------------------------------------

const SlackSessionSourceSchema = SlackSourceSchema.extend({
  delegationSessionId: z.string(),
});

const WebSessionSourceSchema = WebSourceSchema.extend({
  delegationSessionId: z.string(),
});

const ApiSessionSourceSchema = ApiSourceSchema.extend({
  delegationSessionId: z.string(),
});

const SessionsApiSessionSourceSchema = SessionsApiSourceSchema.extend({
  delegationSessionId: z.string(),
});

const LinearSessionSourceSchema = LinearSourceSchema.extend({
  delegationSessionId: z.string(),
});

export const SessionSourceSchema = z.discriminatedUnion('platform', [
  SlackSessionSourceSchema,
  WebSessionSourceSchema,
  ApiSessionSourceSchema,
  SessionsApiSessionSourceSchema,
  LinearSessionSourceSchema,
  ReadinessRemediationSourceSchema, // No delegationSessionId needed
  ReadinessEvaluationSourceSchema, // No delegationSessionId needed
  AutomationSourceSchema, // No delegationSessionId needed
  WikiGenerationSourceSchema, // No delegationSessionId needed
  WikiCISetupSourceSchema, // No delegationSessionId needed
]);

// -------------------------------------------------------------
// Inferred types (single source of truth)
// -------------------------------------------------------------

export type SlackSource = z.infer<typeof SlackSourceSchema>;
export type WebSource = z.infer<typeof WebSourceSchema>;
export type ApiSource = z.infer<typeof ApiSourceSchema>;
export type SessionsApiSource = z.infer<typeof SessionsApiSourceSchema>;
export type LinearSource = z.infer<typeof LinearSourceSchema>;
export type ReadinessRemediationSource = z.infer<
  typeof ReadinessRemediationSourceSchema
>;
export type ReadinessEvaluationSource = z.infer<
  typeof ReadinessEvaluationSourceSchema
>;
export type AutomationSource = z.infer<typeof AutomationSourceSchema>;
export type WikiGenerationSource = z.infer<typeof WikiGenerationSourceSchema>;
export type WikiCISetupSource = z.infer<typeof WikiCISetupSourceSchema>;
export type PlatformSource =
  | SlackSource
  | WebSource
  | ApiSource
  | SessionsApiSource
  | LinearSource
  | ReadinessRemediationSource
  | ReadinessEvaluationSource
  | AutomationSource
  | WikiGenerationSource
  | WikiCISetupSource;
export type SessionSource = z.infer<typeof SessionSourceSchema>;
