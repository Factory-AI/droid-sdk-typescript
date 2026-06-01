/**
 * Daemon-only settings schemas.
 * These are for settings that are stored/retrieved directly by the daemon
 * without forwarding to the CLI process.
 */
import z from 'zod';

import { AvailableModelConfigSchema } from '../client.js';
import {
  AutonomyLevel,
  AutonomyMode,
  ReasoningEffort,
  SettingsLevel,
} from '../enums.js';
import {
  DroidInteractionModeSchema,
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseFailureSchema,
  JsonRpcBaseResponseSuccessSchema,
} from '../json-rpc.js';
import {
  MissionModelSettingsSchema,
  SubagentModelSettingsSchema,
} from '../model-settings.js';
import { DaemonSettingsMethod } from './enums.js';

// ---------------------------------------------------------------------------
// Inlined helpers from the private settings/schema.ts source. Inlined because
// the full settings schema is not yet ported into the public SDK. These mirror
// the field shapes the daemon settings RPCs reference; the wire shape stays
// faithful to the source.
// ---------------------------------------------------------------------------

const ReasoningEffortSchema = z.nativeEnum(ReasoningEffort);

// CompactionModelSchema in the source is a union over a fixed enum of model
// IDs plus a `custom:` prefix string. The wire shape is fundamentally a
// string, so we mirror that here without pulling the entire ModelID enum.
const CompactionModelSchema = z.string();

const SessionDefaultSettingsSchema = z.object({
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  interactionMode: DroidInteractionModeSchema.optional(),
  autonomyLevel: z.nativeEnum(AutonomyLevel).optional(),
  autonomyMode: z
    .nativeEnum(AutonomyMode)
    .optional()
    .describe('Deprecated: use interactionMode + autonomyLevel instead.'),
  specModeModel: z.string().optional(),
  specModeReasoningEffort: ReasoningEffortSchema.optional(),
  runInWorktree: z.boolean().optional(),
});

const GeneralSettingsSchema = z.object({
  specSaveDir: z.string().optional(),
  missionOrchestratorModel: z.string().optional(),
  missionOrchestratorReasoningEffort: ReasoningEffortSchema.optional(),
  worktreeDirectory: z.string().optional(),
  compactionTokenLimit: z.number().optional(),
  compactionTokenLimitPerModel: z.record(z.number()).optional(),
  compactionModel: CompactionModelSchema.optional(),
});

const SettingsSourceTypeEnum = z.enum([
  'builtin-default',
  'dynamic-config',
  'org',
  'user',
  'project',
  'folder',
  'feature-flag',
  'localstorage',
  'nav-state',
  'orchestrator-override',
  'auto-select',
  'session-state',
]);

const SettingsSourceSchema = z.object({
  type: SettingsSourceTypeEnum,
  filePath: z.string().optional(),
  flagName: z.string().optional(),
  key: z.string().optional(),
  orgId: z.string().optional(),
});

const SettingsActionEnum = z.enum(['set', 'override', 'skip', 'fallback']);

const SettingsResolutionLocationSchema = z.object({
  package: z.string(),
  file: z.string(),
  function: z.string().optional(),
});

const SettingsResolutionEventSchema = z.object({
  timestamp: z.string(),
  keys: z.array(z.string()),
  action: SettingsActionEnum,
  source: SettingsSourceSchema,
  value: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
  location: SettingsResolutionLocationSchema.optional(),
});

// ---------------------------------------------------------------------------
// Daemon settings RPC schemas
// ---------------------------------------------------------------------------

// Request params schemas
export const DaemonGetDefaultSettingsRequestParamsSchema = z.object({});
const DaemonSettingsManagementInfoSchema = z.object({
  disabled: z.boolean(),
  source: z.nativeEnum(SettingsLevel).nullable(),
  folderPath: z.string().optional(),
});
const DaemonSettingsManagementInfoFieldSchema =
  DaemonSettingsManagementInfoSchema.optional().catch(undefined);
const LegacyCompactionModelModeWireSchema = z.enum([
  'current-model',
  'factory-default',
]);
const DaemonSubagentDefaultsManagementMapSchema = z
  .object({
    lightModel: DaemonSettingsManagementInfoFieldSchema,
    lightReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    mediumModel: DaemonSettingsManagementInfoFieldSchema,
    mediumReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    heavyModel: DaemonSettingsManagementInfoFieldSchema,
    heavyReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
  })
  .catch({});
const DaemonMissionDefaultsManagementMapSchema = z
  .object({
    orchestratorModel: DaemonSettingsManagementInfoFieldSchema,
    orchestratorReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    workerModel: DaemonSettingsManagementInfoFieldSchema,
    workerReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    validationWorkerModel: DaemonSettingsManagementInfoFieldSchema,
    validationWorkerReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    skipScrutiny: DaemonSettingsManagementInfoFieldSchema,
    skipUserTesting: DaemonSettingsManagementInfoFieldSchema,
  })
  .catch({});
export const DaemonSessionDefaultsManagementMapSchema = z
  .object({
    modelId: DaemonSettingsManagementInfoFieldSchema,
    reasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    interactionMode: DaemonSettingsManagementInfoFieldSchema,
    autonomyLevel: DaemonSettingsManagementInfoFieldSchema,
    autonomyMode: DaemonSettingsManagementInfoFieldSchema,
    specModeModelId: DaemonSettingsManagementInfoFieldSchema,
    specModeReasoningEffort: DaemonSettingsManagementInfoFieldSchema,
    specSaveDir: DaemonSettingsManagementInfoFieldSchema,
    compactionTokenLimit: DaemonSettingsManagementInfoFieldSchema,
    compactionTokenLimitPerModel: DaemonSettingsManagementInfoFieldSchema,
    compactionModel: DaemonSettingsManagementInfoFieldSchema,
    compactionModelMode: DaemonSettingsManagementInfoFieldSchema,
    runInWorktree: DaemonSettingsManagementInfoFieldSchema,
    worktreeDirectory: DaemonSettingsManagementInfoFieldSchema,
    subagent:
      DaemonSubagentDefaultsManagementMapSchema.optional().catch(undefined),
    mission:
      DaemonMissionDefaultsManagementMapSchema.optional().catch(undefined),
  })
  .catch({});
export const DaemonUpdateSessionDefaultsRequestParamsSchema = z.object({
  modelId: SessionDefaultSettingsSchema.shape.model,
  reasoningEffort: SessionDefaultSettingsSchema.shape.reasoningEffort,
  interactionMode: SessionDefaultSettingsSchema.shape.interactionMode,
  autonomyLevel: SessionDefaultSettingsSchema.shape.autonomyLevel,
  specModeModelId: SessionDefaultSettingsSchema.shape.specModeModel.nullable(),
  specModeReasoningEffort:
    SessionDefaultSettingsSchema.shape.specModeReasoningEffort.nullable(),
  compactionTokenLimit: GeneralSettingsSchema.shape.compactionTokenLimit,
  compactionTokenLimitPerModel:
    GeneralSettingsSchema.shape.compactionTokenLimitPerModel,
  compactionModel: GeneralSettingsSchema.shape.compactionModel,
  compactionModelMode: LegacyCompactionModelModeWireSchema.optional().describe(
    'Deprecated wire input retained for existing daemon clients; use compactionModel instead.'
  ),
  subagentModelSettings: SubagentModelSettingsSchema.partial().optional(),
  specSaveDir: GeneralSettingsSchema.shape.specSaveDir.nullable().optional(),
  missionOrchestratorModel: GeneralSettingsSchema.shape.missionOrchestratorModel
    .nullable()
    .optional(),
  missionOrchestratorReasoningEffort:
    GeneralSettingsSchema.shape.missionOrchestratorReasoningEffort
      .nullable()
      .optional(),
  missionModelSettings: MissionModelSettingsSchema.partial().optional(),
  runInWorktree: SessionDefaultSettingsSchema.shape.runInWorktree
    .nullable()
    .optional(),
  worktreeDirectory: GeneralSettingsSchema.shape.worktreeDirectory
    .nullable()
    .optional(),
});

const DaemonSpecSavePresetsSchema = z
  .object({
    projectFactoryDir: z.string().optional(),
    userFactoryDir: z.string(),
  })
  .optional();

// Request schemas
export const DaemonGetDefaultSettingsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonSettingsMethod.GET_DEFAULT_SETTINGS),
    params: DaemonGetDefaultSettingsRequestParamsSchema,
  });

export const DaemonUpdateSessionDefaultsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonSettingsMethod.UPDATE_SESSION_DEFAULTS),
    params: DaemonUpdateSessionDefaultsRequestParamsSchema,
  });

// Result schemas
export const DaemonGetDefaultSettingsResultSchema = z.object({
  autonomyMode: z
    .nativeEnum(AutonomyMode)
    .describe('Deprecated: use interactionMode + autonomyLevel instead.')
    .optional(),
  interactionMode: DroidInteractionModeSchema.optional().catch(undefined),
  autonomyLevel: z.nativeEnum(AutonomyLevel).optional().catch(undefined),
  maxAutonomyLevel: z.nativeEnum(AutonomyLevel).optional().catch(undefined),
  modelId: z.string().optional(),
  reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
  specSaveDir: z.string().optional(),
  specModeModelId: z.string().optional(),
  specModeReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
  compactionTokenLimit: z.number().optional(),
  compactionTokenLimitPerModel: z.record(z.number()).optional(),
  compactionModel: GeneralSettingsSchema.shape.compactionModel,
  compactionModelMode: LegacyCompactionModelModeWireSchema.optional().describe(
    'Deprecated wire view retained for existing daemon clients; use compactionModel instead.'
  ),
  runInWorktree: z.boolean().optional(),
  worktreeDirectory: z.string().optional(),
  management: DaemonSessionDefaultsManagementMapSchema.optional(),
  missionOrchestratorModel: z.string().optional(),
  missionOrchestratorReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
  missionSettings: MissionModelSettingsSchema.optional(),
  subagentModelSettings: SubagentModelSettingsSchema.optional(),
  availableModels: z.array(AvailableModelConfigSchema).optional(),
  specSavePresets: DaemonSpecSavePresetsSchema,
  resolutionChain: z
    .array(SettingsResolutionEventSchema)
    .optional()
    .catch(undefined),
});

export const DaemonUpdateSessionDefaultsResultSchema = z.object({
  success: z.boolean(),
  defaults: DaemonGetDefaultSettingsResultSchema,
});

// Response schemas
export const DaemonGetDefaultSettingsResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonGetDefaultSettingsResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const DaemonUpdateSessionDefaultsResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonUpdateSessionDefaultsResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);
