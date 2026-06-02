import { z } from 'zod';

import {
  FACTORY_ROUTER_GUIDANCE_MAX_LENGTH,
  FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH,
  FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH,
  FACTORY_ROUTER_RULES_MAX_COUNT,
} from './constants.js';
import { CustomModelsSchema } from './custom-models.js';
import {
  AutonomyLevel,
  DiffMode,
  LogoAnimationMode,
  ModelID,
  ReasoningEffort,
  SandboxMode,
  SoundFocusMode,
  SubagentSoundMode,
  TodoDisplayMode,
  ToolResultDisplay,
} from './enums.js';
import {
  MissionModelSettingsSchema,
  SubagentModelSettingsSchema,
} from './model-settings.js';
import { UserModelPolicySchema } from './policy.js';
import {
  CompactionModelSchema,
  MarketplaceSourceSchema,
  SessionDefaultSettingsSchema,
} from './settings.js';

const ReasoningEffortSchema = z.nativeEnum(ReasoningEffort);

// =============================================================================
// Model Policy Schema (for org-level model access control)
// =============================================================================

/**
 * A lenient model ID array that silently drops unrecognized values instead of
 * failing validation. Ensures backward compatibility when ModelID enum values
 * are removed — persisted settings referencing old IDs filter them out rather
 * than failing to parse.
 */
const modelIdValues: ReadonlySet<string> = new Set(Object.values(ModelID));
const tolerantModelIdArray = z
  .array(z.string())
  .transform((ids) => ids.filter((id): id is ModelID => modelIdValues.has(id)));

export const ModelPolicySchema = z.object({
  allowedModelIds: tolerantModelIdArray.optional(),
  blockedModelIds: tolerantModelIdArray.optional(),
  allowCustomModels: z.boolean().optional(),
  allowedBaseUrls: z.array(z.string()).optional(),
  allowAllFactoryModels: z.boolean().optional(),
  isFastModelsAllowed: z.boolean().optional(),
});

// =============================================================================
// MCP Policy Schema (for org-level MCP server access control)
// =============================================================================

export const McpPolicySchema = z.object({
  enabled: z.boolean().default(false),
  allowlist: z.array(z.string()).optional(),
});

// =============================================================================
// Mission Policy Schema (for org-level missions access control)
// =============================================================================

export const MissionPolicySchema = z.object({
  restrictedAccess: z.boolean().default(false),
  allowedUserIds: z.array(z.string()).optional(),
});

// =============================================================================
// Network Policy Schema (for org-level network access control)
// IP format validation is handled by @factory/utils/ip (isValidIpOrCidr).
// The schema only enforces shape: non-empty array of trimmed strings.
// =============================================================================

const NetworkPolicySchema = z.object({
  allowedIps: z
    .array(z.string().trim())
    .min(1, 'IP allowlist must contain at least one entry when enabled'),
});

// =============================================================================
// Sandbox Settings Schema
// =============================================================================

export const SandboxFilesystemSettingsSchema = z.object({
  allowWrite: z.array(z.string()).optional(),
  allowRead: z.array(z.string()).optional(),
  denyWrite: z.array(z.string()).optional(),
  denyRead: z.array(z.string()).optional(),
});

export const SandboxNetworkSettingsSchema = z.object({
  allowedDomains: z.array(z.string()).optional(),
  allowUnixSockets: z.array(z.string()).optional(),
  allowAllUnixSockets: z.boolean().optional(),
  allowLocalBinding: z.boolean().optional(),
  httpProxyPort: z.number().optional(),
  socksProxyPort: z.number().optional(),
});

const SandboxModeSchema = z.nativeEnum(SandboxMode);

export const SandboxSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  mode: SandboxModeSchema.optional(),
  filesystem: SandboxFilesystemSettingsSchema.optional(),
  network: SandboxNetworkSettingsSchema.optional(),
});

// =============================================================================
// Session Retention Constants
// =============================================================================

export const SESSION_RETENTION_MIN_DAYS = 14;
export const SESSION_RETENTION_MAX_DAYS = 365;

const ExtraMarketplaceEntrySchema = z.object({
  source: MarketplaceSourceSchema,
});

export const FactoryRouterRuleSchema = z.object({
  when: z.string().max(FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH).optional(),
  guidance: z.string().max(FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH),
});

// =============================================================================
// Managed Settings Schema
// =============================================================================

const McpAutonomyLevelSchema = z.enum([
  AutonomyLevel.Low,
  AutonomyLevel.Medium,
  AutonomyLevel.High,
]);

const McpAutonomyUrlOverrideSchema = z.object({
  urlPattern: z.string().trim().min(1),
  defaultLevel: McpAutonomyLevelSchema,
});

const StatusLineConfigSchema = z.object({
  type: z.literal('command').optional(),
  command: z.string(),
  padding: z.number().optional(),
  maxRows: z.number().int().min(1).max(3).optional(),
});

// Exported (not internal-only) to allow `.extend(...)` across module
// boundaries and to surface it on the public protocol namespace.
export const ManagedSettingsBaseSchema = z.object({
  sessionDefaultSettings: SessionDefaultSettingsSchema.optional(),
  maxAutonomyLevel: z.nativeEnum(AutonomyLevel).optional(),
  mcpAutonomyOverrides: z
    .record(
      z.string(),
      z.object({
        defaultLevel: McpAutonomyLevelSchema.optional(),
        tools: z.record(z.string(), McpAutonomyLevelSchema).optional(),
      })
    )
    .optional(),
  mcpAutonomyUrlOverrides: z.array(McpAutonomyUrlOverrideSchema).optional(),
  cloudSessionSync: z.boolean().optional(),
  wikiCloudSync: z.boolean().optional(),
  includeCoAuthoredByDroid: z.boolean().optional(),
  enableDroidShield: z.boolean().optional(),
  ideAutoConnect: z.boolean().optional(),
  commandAllowlist: z.array(z.string()).optional(),
  commandDenylist: z.array(z.string()).optional(),
  customModels: CustomModelsSchema.optional(),
  modelPolicy: ModelPolicySchema.optional(),
  mcpPolicy: McpPolicySchema.optional(),
  missionPolicy: MissionPolicySchema.optional(),
  userModelPolicies: z.record(z.string(), UserModelPolicySchema).optional(),
  enabledPlugins: z.record(z.boolean()).optional(),
  extraKnownMarketplaces: z.record(ExtraMarketplaceEntrySchema).optional(),
  strictKnownMarketplaces: z.array(MarketplaceSourceSchema).optional(),
  networkPolicy: NetworkPolicySchema.optional(),
  sandbox: SandboxSettingsSchema.optional(),
  restrictMemberVisibility: z.boolean().optional(),
  restrictApiKeyCreationToManagers: z.boolean().optional(),
  managedComputersEnabled: z.boolean().optional(),
  managedComputersAllowedEmails: z.array(z.string().trim()).optional(),
  byomComputersEnabled: z.boolean().optional(),
  byomComputersAllowedEmails: z.array(z.string().trim()).optional(),
  sessionRetentionDays: z
    .number()
    .int()
    .min(SESSION_RETENTION_MIN_DAYS)
    .max(SESSION_RETENTION_MAX_DAYS)
    .optional(),
  factoryRouterGuidance: z
    .string()
    .max(FACTORY_ROUTER_GUIDANCE_MAX_LENGTH)
    .optional(),
  factoryRouterRules: z
    .array(FactoryRouterRuleSchema)
    .max(FACTORY_ROUTER_RULES_MAX_COUNT)
    .optional(),
});

// =============================================================================
// General Settings Schema (CLI settings.json / settings.local.json)
// =============================================================================

export const GeneralSettingsSchema = ManagedSettingsBaseSchema.extend({
  diffMode: z.nativeEnum(DiffMode).optional(),
  ideExtensionPromptedAt: z.record(z.number()).optional(),
  ideActivationNudgedForVersion: z.record(z.string()).optional(),
  enableCompletionBell: z.boolean().optional(),
  completionSound: z.string().optional(),
  awaitingInputSound: z.string().optional(),
  soundFocusMode: z.nativeEnum(SoundFocusMode).optional(),
  completionSoundFocusMode: z.nativeEnum(SoundFocusMode).optional(),
  awaitingInputSoundFocusMode: z.nativeEnum(SoundFocusMode).optional(),
  specSaveEnabled: z.boolean().optional(),
  specSaveDir: z.string().optional(),
  todoDisplayMode: z.nativeEnum(TodoDisplayMode).optional(),
  toolResultDisplay: z.nativeEnum(ToolResultDisplay).optional(),
  showThinkingInMainView: z.boolean().optional(),
  keepSystemAwakeDuringMissions: z.boolean().optional(),
  showTokenUsageIndicator: z.boolean().optional(),
  missionOrchestratorModel: z.string().optional(),
  missionOrchestratorReasoningEffort: ReasoningEffortSchema.optional(),
  modelFavorites: z.array(z.string()).optional(),
  dismissedNewModels: z.array(z.string()).optional(),
  logoAnimation: z.nativeEnum(LogoAnimationMode).optional(),
  missionModelSettings: MissionModelSettingsSchema.optional(),
  subagentModelSettings: SubagentModelSettingsSchema.optional(),
  statusLine: StatusLineConfigSchema.optional(),
  theme: z.string().optional(),
  overrideTerminalColors: z.boolean().optional(),
  hasSeenMissionOnboarding: z.boolean().optional(),
  worktreeDirectory: z.string().optional(),
  windowZoomLevel: z.number().finite().optional(),
  remoteAccessEnabled: z.boolean().optional(),
  llmRequestTimeout: z.number().min(1000).optional(),
  subagentInactivityTimeout: z.number().min(1000).optional(),
  subagentSounds: z.nativeEnum(SubagentSoundMode).optional(),
  nerdFont: z.boolean().optional(),
  compactionTokenLimit: z.number().optional(),
  compactionTokenLimitPerModel: z.record(z.number()).optional(),
  compactionModel: CompactionModelSchema.optional(),
});

export type ManagedSettingsBase = z.infer<typeof ManagedSettingsBaseSchema>;
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;
export type ModelPolicy = z.infer<typeof ModelPolicySchema>;
export type McpPolicy = z.infer<typeof McpPolicySchema>;
export type MissionPolicy = z.infer<typeof MissionPolicySchema>;
export type SandboxSettings = z.infer<typeof SandboxSettingsSchema>;
export type FactoryRouterRule = z.infer<typeof FactoryRouterRuleSchema>;
