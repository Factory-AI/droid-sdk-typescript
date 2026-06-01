import { describe, expect, it } from 'vitest';

import { AutomationPrivacyLevel as TopLevelAutomationPrivacyLevel } from '../src/protocol/automations-enums.js';
import { AutomationPrivacyLevel as DaemonAutomationPrivacyLevel } from '../src/protocol/daemon/automations-enums.js';
import {
  AutomationCreatedBySchema,
  AutomationsHeartbeatSchema,
  BinaryDownloadPlanSchema,
  DiffLineSchema,
  EditToolInputSchema,
  EffectiveFactoryRouterModelSchema,
  ExecuteToolInputSchema,
  FileOperationResultSchema,
  GenericToolExecutionOutputSchema,
  RiskLevel,
  SessionSettingsSchema,
  SessionSummaryEventSchema,
  SessionTitleAutoStage,
  UserModelPolicySchema,
  usage,
} from '../src/protocol/index.js';

describe('protocol/automations (TIER-4d)', () => {
  it('parses a sample HEARTBEAT.md frontmatter object', () => {
    const parsed = AutomationsHeartbeatSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Daily health-check',
      description: 'Pings the API',
      schedule: '0 9 * * 1-5',
      model: 'gpt-5',
      tags: ['ops'],
      paused: false,
      privacyLevel: 'organization',
      createdBy: { name: 'Ada', email: 'ada@example.com' },
      forkedFrom: 'parent-uuid',
    });
    expect(parsed.name).toBe('Daily health-check');
    expect(parsed.privacyLevel).toBe('organization');
  });

  it('exposes AutomationCreatedBySchema', () => {
    const created = AutomationCreatedBySchema.parse({ name: 'Ada' });
    expect(created.name).toBe('Ada');
  });

  it('consolidates AutomationPrivacyLevel between top-level and daemon paths', () => {
    expect(DaemonAutomationPrivacyLevel).toBe(TopLevelAutomationPrivacyLevel);
    expect(DaemonAutomationPrivacyLevel.Private).toBe('private');
  });
});

describe('protocol/session-summary (TIER-4d)', () => {
  it('parses a sample session_start event', () => {
    const event = SessionSummaryEventSchema.parse({
      type: 'session_start',
      id: 'sess-1',
      title: 'Initial title',
      sessionTitle: 'Working on TIER-4d',
      isSessionTitleManuallySet: true,
      sessionTitleAutoStage: SessionTitleAutoStage.FirstMessage,
      owner: 'user@example.com',
      parent: null,
      version: 1,
      cwd: '/tmp/work',
    });
    expect(event.type).toBe('session_start');
    expect(event.sessionTitleAutoStage).toBe('first_message');
  });
});

describe('protocol/session-tools (TIER-4d)', () => {
  it('accepts a string, object, or array for generic tool output', () => {
    expect(GenericToolExecutionOutputSchema.parse('ok')).toBe('ok');
    expect(GenericToolExecutionOutputSchema.parse({ a: 1 })).toEqual({ a: 1 });
    expect(GenericToolExecutionOutputSchema.parse(['a', { b: 2 }])).toEqual([
      'a',
      { b: 2 },
    ]);
  });
});

describe('protocol/session-settings (TIER-4d)', () => {
  it('parses a minimal SessionSettings payload', () => {
    const settings = SessionSettingsSchema.parse({});
    expect(settings).toBeDefined();
  });

  it('parses an EffectiveFactoryRouterModel payload', () => {
    const eff = EffectiveFactoryRouterModelSchema.parse({
      modelId: 'gpt-5',
      apiProvider: 'openai',
      reasoningEffort: 'medium',
    });
    expect(eff.modelId).toBe('gpt-5');
  });
});

describe('protocol/policy (TIER-4d)', () => {
  it('parses a UserModelPolicy with real ModelID values and drops unknowns', () => {
    const parsed = UserModelPolicySchema.parse({
      allowedModelIds: ['claude-opus-4-7', 'definitely-not-a-real-model-id'],
      blockedModelIds: ['gpt-5.4', 'also-not-real'],
    });
    expect(parsed.allowedModelIds).toEqual(['claude-opus-4-7']);
    expect(parsed.blockedModelIds).toEqual(['gpt-5.4']);
  });
});

describe('protocol/tools (TIER-4d)', () => {
  it('parses an EditToolInput', () => {
    const input = EditToolInputSchema.parse({
      file_path: '/tmp/x.ts',
      old_str: 'foo',
      new_str: 'bar',
    });
    expect(input.file_path).toBe('/tmp/x.ts');
  });

  it('exposes RiskLevel members', () => {
    expect(RiskLevel.LOW).toBe('low');
    expect(RiskLevel.MEDIUM).toBe('medium');
    expect(RiskLevel.HIGH).toBe('high');
  });

  it('parses an ExecuteToolInput with a risk level', () => {
    const input = ExecuteToolInputSchema.parse({
      command: 'ls',
      riskLevel: RiskLevel.LOW,
      riskLevelReason: 'read-only',
    });
    expect(input.riskLevel).toBe('low');
  });

  it('parses a DiffLineSchema and FileOperationResultSchema', () => {
    const line = DiffLineSchema.parse({ type: 'added', content: '+ hello' });
    expect(line.type).toBe('added');
    const result = FileOperationResultSchema.parse({
      success: true,
      diff: 'whatever',
    });
    expect(result.success).toBe(true);
  });
});

describe('protocol/updater (TIER-4d)', () => {
  it('parses a BinaryDownloadPlan', () => {
    const plan = BinaryDownloadPlanSchema.parse({
      version: '1.2.3',
      binaryUrl: 'https://example/bin',
      checksumUrl: 'https://example/bin.sha256',
    });
    expect(plan.version).toBe('1.2.3');
  });
});

describe('protocol/usage (TIER-4d)', () => {
  it('parses a TokenUsage payload via the usage namespace', () => {
    const tokens = usage.TokenUsageSchema.parse({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      thinkingTokens: 0,
    });
    expect(tokens.inputTokens).toBe(100);
  });
});
