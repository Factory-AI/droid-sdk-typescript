import { describe, expect, it } from 'vitest';

import {
  CURRENT_COMPACTION_MODEL,
  FACTORY_ROUTER_GUIDANCE_MAX_LENGTH,
  FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH,
  FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH,
  FACTORY_ROUTER_RULES_MAX_COUNT,
} from '../src/protocol/constants.js';
import {
  AutonomyLevel,
  DiffMode,
  LogoAnimationMode,
  ModelID,
  SandboxMode,
  SoundFocusMode,
  SubagentSoundMode,
  TodoDisplayMode,
  ToolResultDisplay,
} from '../src/protocol/enums.js';
import {
  FactoryRouterRuleSchema,
  GeneralSettingsSchema,
  ManagedSettingsBaseSchema,
  McpPolicySchema,
  MissionPolicySchema,
  ModelPolicySchema,
  SandboxSettingsSchema,
  SESSION_RETENTION_MAX_DAYS,
  SESSION_RETENTION_MIN_DAYS,
} from '../src/protocol/general-settings.js';

describe('protocol/general-settings — verbatim port', () => {
  it('exports ManagedSettingsBaseSchema and GeneralSettingsSchema as zod objects', () => {
    expect(typeof ManagedSettingsBaseSchema.parse).toBe('function');
    expect(typeof GeneralSettingsSchema.parse).toBe('function');
  });

  it('exports router-rule constants verbatim from upstream', () => {
    expect(FACTORY_ROUTER_GUIDANCE_MAX_LENGTH).toBe(2000);
    expect(FACTORY_ROUTER_RULES_MAX_COUNT).toBe(20);
    expect(FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH).toBe(300);
    expect(FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH).toBe(600);
  });

  it('exports session-retention bounds verbatim from upstream', () => {
    expect(SESSION_RETENTION_MIN_DAYS).toBe(14);
    expect(SESSION_RETENTION_MAX_DAYS).toBe(365);
  });

  it('exposes the new enums verbatim from upstream', () => {
    expect(DiffMode.Github).toBe('github');
    expect(DiffMode.Unified).toBe('unified');
    expect(SoundFocusMode.Always).toBe('always');
    expect(SoundFocusMode.Focused).toBe('focused');
    expect(SoundFocusMode.Unfocused).toBe('unfocused');
    expect(TodoDisplayMode.Inline).toBe('inline');
    expect(TodoDisplayMode.Pinned).toBe('pinned');
    expect(SubagentSoundMode.Off).toBe('off');
    expect(SubagentSoundMode.Quiet).toBe('quiet');
    expect(SubagentSoundMode.Inherit).toBe('inherit');
    expect(LogoAnimationMode.Once).toBe('once');
    expect(LogoAnimationMode.Always).toBe('always');
    expect(LogoAnimationMode.Off).toBe('off');
    expect(ToolResultDisplay.Expanded).toBe('expanded');
    expect(ToolResultDisplay.Compact).toBe('compact');
  });

  it('ModelPolicySchema accepts the full upstream shape and tolerates unknown ids', () => {
    const parsed = ModelPolicySchema.parse({
      allowedModelIds: [ModelID.CLAUDE_OPUS_4_7, 'not-a-real-model'],
      blockedModelIds: [ModelID.GPT_5_5],
      allowCustomModels: true,
      allowedBaseUrls: ['https://example.com'],
      allowAllFactoryModels: false,
      isFastModelsAllowed: true,
    });
    expect(parsed.allowedModelIds).toEqual([ModelID.CLAUDE_OPUS_4_7]);
    expect(parsed.blockedModelIds).toEqual([ModelID.GPT_5_5]);
    expect(parsed.allowCustomModels).toBe(true);
  });

  it('McpPolicySchema defaults enabled to false and accepts allowlist', () => {
    expect(McpPolicySchema.parse({})).toEqual({ enabled: false });
    expect(
      McpPolicySchema.parse({ enabled: true, allowlist: ['mcp-a'] })
    ).toEqual({
      enabled: true,
      allowlist: ['mcp-a'],
    });
  });

  it('MissionPolicySchema defaults restrictedAccess to false', () => {
    expect(MissionPolicySchema.parse({})).toEqual({ restrictedAccess: false });
  });

  it('SandboxSettingsSchema accepts the full nested shape', () => {
    const parsed = SandboxSettingsSchema.parse({
      enabled: true,
      mode: SandboxMode.WholeProcess,
      filesystem: {
        allowWrite: ['/tmp/a'],
        allowRead: ['/'],
        denyWrite: ['/etc'],
        denyRead: ['/secrets'],
      },
      network: {
        allowedDomains: ['example.com'],
        allowUnixSockets: ['/var/run/docker.sock'],
        allowAllUnixSockets: false,
        allowLocalBinding: true,
        httpProxyPort: 8080,
        socksProxyPort: 1080,
      },
    });
    expect(parsed.mode).toBe('whole-process');
    expect(parsed.filesystem?.allowRead).toEqual(['/']);
    expect(parsed.network?.httpProxyPort).toBe(8080);
  });

  it('FactoryRouterRuleSchema enforces guidance and when length caps', () => {
    expect(
      FactoryRouterRuleSchema.parse({
        when: 'short condition',
        guidance: 'do this',
      })
    ).toEqual({ when: 'short condition', guidance: 'do this' });

    const tooLongWhen = 'x'.repeat(FACTORY_ROUTER_RULE_WHEN_MAX_LENGTH + 1);
    expect(
      FactoryRouterRuleSchema.safeParse({ when: tooLongWhen, guidance: 'ok' })
        .success
    ).toBe(false);

    const tooLongGuidance = 'y'.repeat(
      FACTORY_ROUTER_RULE_GUIDANCE_MAX_LENGTH + 1
    );
    expect(
      FactoryRouterRuleSchema.safeParse({ guidance: tooLongGuidance }).success
    ).toBe(false);
  });

  it('ManagedSettingsBaseSchema parses a representative payload', () => {
    const parsed = ManagedSettingsBaseSchema.parse({
      sessionDefaultSettings: { model: ModelID.CLAUDE_OPUS_4_7 },
      maxAutonomyLevel: AutonomyLevel.Medium,
      cloudSessionSync: true,
      includeCoAuthoredByDroid: false,
      modelPolicy: { allowedModelIds: [ModelID.CLAUDE_OPUS_4_7] },
      sessionRetentionDays: 30,
      factoryRouterRules: [{ when: 'always', guidance: 'route to opus' }],
    });
    expect(parsed.maxAutonomyLevel).toBe('medium');
    expect(parsed.sessionRetentionDays).toBe(30);
    expect(parsed.factoryRouterRules).toHaveLength(1);
  });

  it('GeneralSettingsSchema parses a wide payload exercising base + extended fields', () => {
    const parsed = GeneralSettingsSchema.parse({
      // base fields
      sessionDefaultSettings: { model: ModelID.CLAUDE_OPUS_4_7 },
      maxAutonomyLevel: AutonomyLevel.High,
      cloudSessionSync: true,
      wikiCloudSync: false,
      includeCoAuthoredByDroid: true,
      enableDroidShield: true,
      ideAutoConnect: false,
      commandAllowlist: ['ls'],
      commandDenylist: ['rm -rf /'],
      modelPolicy: { allowCustomModels: true },
      mcpPolicy: { enabled: true, allowlist: ['linear'] },
      missionPolicy: { restrictedAccess: false },
      enabledPlugins: { plugin1: true },
      sandbox: { enabled: false },
      restrictMemberVisibility: true,
      restrictApiKeyCreationToManagers: false,
      managedComputersEnabled: false,
      managedComputersAllowedEmails: ['ops@example.com'],
      byomComputersEnabled: false,
      byomComputersAllowedEmails: [],
      sessionRetentionDays: 90,
      factoryRouterGuidance: 'route to opus for hard tasks',
      factoryRouterRules: [{ guidance: 'route to opus' }],
      // extended general fields
      diffMode: DiffMode.Github,
      ideExtensionPromptedAt: { vscode: 1700000000 },
      ideActivationNudgedForVersion: { vscode: '1.0.0' },
      enableCompletionBell: true,
      completionSound: 'fx-ok01',
      awaitingInputSound: 'fx-ack01',
      soundFocusMode: SoundFocusMode.Always,
      completionSoundFocusMode: SoundFocusMode.Focused,
      awaitingInputSoundFocusMode: SoundFocusMode.Unfocused,
      specSaveEnabled: true,
      specSaveDir: '/tmp/specs',
      todoDisplayMode: TodoDisplayMode.Pinned,
      toolResultDisplay: ToolResultDisplay.Expanded,
      showThinkingInMainView: false,
      keepSystemAwakeDuringMissions: true,
      showTokenUsageIndicator: true,
      missionOrchestratorModel: ModelID.CLAUDE_OPUS_4_7,
      missionOrchestratorReasoningEffort: 'high',
      modelFavorites: [ModelID.CLAUDE_OPUS_4_7, ModelID.GPT_5_5],
      logoAnimation: LogoAnimationMode.Once,
      missionModelSettings: { workerModel: ModelID.GPT_5_5 },
      subagentModelSettings: { lightModel: ModelID.GPT_5_5 },
      statusLine: { command: 'echo hi' },
      theme: 'factory-dark',
      overrideTerminalColors: false,
      hasSeenMissionOnboarding: true,
      worktreeDirectory: '/tmp/wt',
      windowZoomLevel: 1.2,
      remoteAccessEnabled: false,
      llmRequestTimeout: 60000,
      subagentInactivityTimeout: 30000,
      subagentSounds: SubagentSoundMode.Off,
      nerdFont: false,
      compactionTokenLimit: 100000,
      compactionTokenLimitPerModel: { [ModelID.CLAUDE_OPUS_4_7]: 200000 },
      compactionModel: CURRENT_COMPACTION_MODEL,
    });
    expect(parsed.diffMode).toBe('github');
    expect(parsed.compactionModel).toBe('current-model');
    expect(parsed.subagentSounds).toBe('off');
    expect(parsed.statusLine?.command).toBe('echo hi');
    expect(parsed.missionModelSettings?.workerModel).toBe(ModelID.GPT_5_5);
    expect(parsed.windowZoomLevel).toBe(1.2);
  });

  it('GeneralSettingsSchema rejects sessionRetentionDays out of range', () => {
    expect(
      GeneralSettingsSchema.safeParse({
        sessionRetentionDays: SESSION_RETENTION_MIN_DAYS - 1,
      }).success
    ).toBe(false);
    expect(
      GeneralSettingsSchema.safeParse({
        sessionRetentionDays: SESSION_RETENTION_MAX_DAYS + 1,
      }).success
    ).toBe(false);
  });

  it('GeneralSettingsSchema rejects factoryRouterRules above the cap', () => {
    const tooMany = Array.from(
      { length: FACTORY_ROUTER_RULES_MAX_COUNT + 1 },
      () => ({
        guidance: 'g',
      })
    );
    expect(
      GeneralSettingsSchema.safeParse({ factoryRouterRules: tooMany }).success
    ).toBe(false);
  });

  it('GeneralSettingsSchema rejects an unknown compactionModel sentinel', () => {
    expect(
      GeneralSettingsSchema.safeParse({ compactionModel: 'not-a-real-model' })
        .success
    ).toBe(false);
  });
});

describe('public API: protocol namespace exposes GeneralSettingsSchema', () => {
  it('protocol.GeneralSettingsSchema is defined and parses an empty payload', async () => {
    const { protocol } = await import('../src/index.js');
    expect(protocol.GeneralSettingsSchema).toBeDefined();
    expect(protocol.ManagedSettingsBaseSchema).toBeDefined();
    expect(protocol.ModelPolicySchema).toBeDefined();
    expect(protocol.McpPolicySchema).toBeDefined();
    expect(protocol.MissionPolicySchema).toBeDefined();
    expect(protocol.SandboxSettingsSchema).toBeDefined();
    expect(protocol.FactoryRouterRuleSchema).toBeDefined();
    expect(protocol.GeneralSettingsSchema.parse({})).toEqual({});
  });
});
