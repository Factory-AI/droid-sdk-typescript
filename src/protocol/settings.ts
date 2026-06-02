// Source-of-truth mirror of factory-mono-alpha settings schemas (symbol-only).
// Faithful copies of the leaf schemas the daemon protocol references, drawn
// from packages/common/src/settings/schema.ts. Verbatim:
//   - MarketplaceSourceSchema (+ inner discriminated-union variants)
//   - SessionDefaultSettingsSchema
//   - CompactionModelSchema
//   - AutonomyModeSchema
//   - SettingsSourceTypeEnum, SettingsSourceSchema, SettingsActionEnum,
//     SettingsResolutionEventSchema (+ private SettingsResolutionLocationSchema)
//
// MissionModelSettingsSchema and SubagentModelSettingsSchema are already
// mirrored verbatim in ./model-settings.js; they are not re-exported here to
// avoid duplicate barrel exports. Callers needing them should import from
// './model-settings.js' as before.
//
// GeneralSettingsSchema and ManagedSettingsBaseSchema (plus their helper
// schemas: ModelPolicySchema, McpPolicySchema, MissionPolicySchema,
// SandboxSettingsSchema, FactoryRouterRuleSchema, etc.) live in
// ./general-settings.js, mirrored verbatim from the same upstream source
// file.

import { z } from 'zod';

import {
  CURRENT_COMPACTION_MODEL,
  FACTORY_ROUTER_MODEL_ID,
} from './constants.js';
import {
  AutonomyLevel,
  AutonomyMode,
  ModelID,
  ReasoningEffort,
} from './enums.js';
import { DroidInteractionModeSchema } from './json-rpc.js';

// =============================================================================
// Session Default Settings Schema
// =============================================================================

const ReasoningEffortSchema = z.nativeEnum(ReasoningEffort);

export const AutonomyModeSchema = z.nativeEnum(AutonomyMode);

const FIRST_COMPACTION_MODEL_ID = 'claude-3-5-sonnet-20241022';
const CompactionModelIdValues: [string, ...string[]] = [
  FIRST_COMPACTION_MODEL_ID,
  ...Object.values(ModelID).filter(
    (modelId) =>
      modelId !== FACTORY_ROUTER_MODEL_ID &&
      modelId !== FIRST_COMPACTION_MODEL_ID
  ),
];

export const CompactionModelSchema = z.union([
  z.literal(CURRENT_COMPACTION_MODEL),
  z.enum(CompactionModelIdValues),
  z.string().regex(/^custom:.+$/, 'Expected a custom model id'),
]);

export const SessionDefaultSettingsSchema = z.object({
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  interactionMode: DroidInteractionModeSchema.optional(),
  autonomyLevel: z.nativeEnum(AutonomyLevel).optional(),
  autonomyMode: AutonomyModeSchema.optional().describe(
    'Deprecated: use interactionMode + autonomyLevel instead.'
  ),
  specModeModel: z.string().optional(),
  specModeReasoningEffort: ReasoningEffortSchema.optional(),
  /**
   * When true, new sessions started against a git repo are created in an
   * isolated worktree. Gated behind the `DesktopWorktrees` feature flag in
   * the desktop UI.
   */
  runInWorktree: z.boolean().optional(),
});

// =============================================================================
// Marketplace Source Schema
// =============================================================================

const GitHubMarketplaceSourceSchema = z.object({
  source: z.literal('github'),
  repo: z.string(),
});

const UrlMarketplaceSourceSchema = z.object({
  source: z.literal('url'),
  url: z.string(),
});

const LocalMarketplaceSourceSchema = z.object({
  source: z.literal('local'),
  path: z.string(),
});

const GitSubdirMarketplaceSourceSchema = z.object({
  source: z.literal('git-subdir'),
  url: z.string(),
  path: z.string(),
});

export const MarketplaceSourceSchema = z.discriminatedUnion('source', [
  GitHubMarketplaceSourceSchema,
  UrlMarketplaceSourceSchema,
  LocalMarketplaceSourceSchema,
  GitSubdirMarketplaceSourceSchema,
]);

// =============================================================================
// Settings Resolution Chain Schemas
// =============================================================================

export const SettingsSourceTypeEnum = z.enum([
  /** Factory's hardcoded defaults (lowest priority) */
  'builtin-default',
  /** Remote dynamic config (e.g. Statsig dynamic configs) */
  'dynamic-config',
  /** Organization-level settings pushed from the server */
  'org',
  /** User-level settings from ~/.factory/settings.json */
  'user',
  /** Project-level settings from <git-root>/.factory/settings.json */
  'project',
  /** Folder-level settings from ancestor .factory/settings.json files */
  'folder',
  /** Model availability determined by a feature flag gate */
  'feature-flag',
  /** Value read from browser localStorage (CLOUD path only) */
  'localstorage',
  /** Value provided via React Router navigation state (e.g. template launch, session continuation) */
  'nav-state',
  /** Model/effort override enforced for orchestrator (mission) sessions */
  'orchestrator-override',
  /** Last-resort fallback when no model was selected after all other sources */
  'auto-select',
  /** Settings restored from the daemon's CLI process for this session — re-resolved from the settings hierarchy if the daemon restarts */
  'session-state',
]);

export const SettingsSourceSchema = z.object({
  type: SettingsSourceTypeEnum,
  filePath: z.string().optional(),
  flagName: z.string().optional(),
  key: z.string().optional(),
  orgId: z.string().optional(),
});

export const SettingsActionEnum = z.enum([
  'set',
  'override',
  'skip',
  'fallback',
]);

const SettingsResolutionLocationSchema = z.object({
  package: z.string(),
  file: z.string(),
  function: z.string().optional(),
});

export const SettingsResolutionEventSchema = z.object({
  timestamp: z.string(),
  keys: z.array(z.string()),
  action: SettingsActionEnum,
  source: SettingsSourceSchema,
  value: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
  location: SettingsResolutionLocationSchema.optional(),
});

export type SessionDefaultSettings = z.infer<
  typeof SessionDefaultSettingsSchema
>;
export type MarketplaceSource = z.infer<typeof MarketplaceSourceSchema>;
export type CompactionModel = z.infer<typeof CompactionModelSchema>;
export type SettingsResolutionEvent = z.infer<
  typeof SettingsResolutionEventSchema
>;
export type SettingsSource = z.infer<typeof SettingsSourceSchema>;
