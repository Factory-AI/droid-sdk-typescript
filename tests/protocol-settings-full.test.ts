import { describe, expect, it } from 'vitest';

import {
  CURRENT_COMPACTION_MODEL,
  FACTORY_ROUTER_MODEL_ID,
} from '../src/protocol/constants.js';
import {
  DaemonUpdateSessionDefaultsRequestSchema,
  MarketplaceSourceSchema as DaemonMarketplaceSourceSchema,
  RedactedMarketplaceSourceSchema,
} from '../src/protocol/daemon/index.js';
import { ModelID } from '../src/protocol/enums.js';
import {
  AutonomyModeSchema,
  CompactionModelSchema,
  GeneralSettingsSchema,
  MarketplaceSourceSchema,
  SessionDefaultSettingsSchema,
  SettingsResolutionEventSchema,
} from '../src/protocol/settings.js';

describe('protocol/settings (ported gap)', () => {
  it('ModelID enum exposes representative members verbatim', () => {
    expect(ModelID.CLAUDE_OPUS_4_7).toBe('claude-opus-4-7');
    expect(ModelID.GPT_5_5).toBe('gpt-5.5');
    expect(ModelID.GEMINI_3_PRO).toBe('gemini-3-pro-preview');
    expect(ModelID.FACTORY_ROUTER).toBe('factory-router');
  });

  it('exports sentinel constants used by CompactionModelSchema', () => {
    expect(CURRENT_COMPACTION_MODEL).toBe('current-model');
    expect(FACTORY_ROUTER_MODEL_ID).toBe('factory-router');
  });

  it('CompactionModelSchema accepts current-model sentinel', () => {
    expect(CompactionModelSchema.parse(CURRENT_COMPACTION_MODEL)).toBe(
      'current-model'
    );
  });

  it('CompactionModelSchema accepts a real ModelID value', () => {
    expect(CompactionModelSchema.parse(ModelID.CLAUDE_OPUS_4_7)).toBe(
      'claude-opus-4-7'
    );
  });

  it('CompactionModelSchema accepts a `custom:` prefixed model id', () => {
    expect(CompactionModelSchema.parse('custom:my-byok-model')).toBe(
      'custom:my-byok-model'
    );
  });

  it('CompactionModelSchema rejects the factory router sentinel', () => {
    const result = CompactionModelSchema.safeParse(FACTORY_ROUTER_MODEL_ID);
    expect(result.success).toBe(false);
  });

  it('CompactionModelSchema rejects an unknown bare string', () => {
    const result = CompactionModelSchema.safeParse('not-a-real-model');
    expect(result.success).toBe(false);
  });

  it('SessionDefaultSettingsSchema parses a minimal payload', () => {
    const parsed = SessionDefaultSettingsSchema.parse({
      model: ModelID.GPT_5_5,
      autonomyMode: 'normal',
    });
    expect(parsed.model).toBe('gpt-5.5');
  });

  it('GeneralSettingsSchema parses the daemon-required fields', () => {
    const parsed = GeneralSettingsSchema.parse({
      compactionTokenLimit: 100_000,
      compactionModel: CURRENT_COMPACTION_MODEL,
      worktreeDirectory: '/tmp/worktrees',
    });
    expect(parsed.compactionModel).toBe('current-model');
  });

  it('MarketplaceSourceSchema parses each discriminated variant', () => {
    expect(
      MarketplaceSourceSchema.parse({ source: 'github', repo: 'owner/repo' })
        .source
    ).toBe('github');
    expect(
      MarketplaceSourceSchema.parse({
        source: 'url',
        url: 'https://example.com/m',
      }).source
    ).toBe('url');
    expect(
      MarketplaceSourceSchema.parse({
        source: 'local',
        path: '/tmp/marketplace',
      }).source
    ).toBe('local');
    expect(
      MarketplaceSourceSchema.parse({
        source: 'git-subdir',
        url: 'https://example.com/r.git',
        path: 'subdir',
      }).source
    ).toBe('git-subdir');
  });

  it('SettingsResolutionEventSchema parses a representative event', () => {
    const parsed = SettingsResolutionEventSchema.parse({
      timestamp: new Date().toISOString(),
      keys: ['model'],
      action: 'set',
      source: { type: 'user', filePath: '/u/.factory/settings.json' },
    });
    expect(parsed.action).toBe('set');
    expect(parsed.source.type).toBe('user');
  });

  it('AutonomyModeSchema accepts all autonomy mode values', () => {
    expect(AutonomyModeSchema.parse('normal')).toBe('normal');
    expect(AutonomyModeSchema.parse('auto-high')).toBe('auto-high');
  });
});

describe('protocol/daemon — Settings/ModelID gap fill integration', () => {
  it('daemon plugins re-exports the SAME MarketplaceSourceSchema instance as the public settings module', () => {
    expect(DaemonMarketplaceSourceSchema).toBe(MarketplaceSourceSchema);
  });

  it('RedactedMarketplaceSourceSchema is intentionally distinct from MarketplaceSourceSchema', () => {
    expect(RedactedMarketplaceSourceSchema).not.toBe(MarketplaceSourceSchema);

    const redacted = RedactedMarketplaceSourceSchema.parse({ source: 'local' });
    expect('path' in redacted).toBe(false);

    const full = MarketplaceSourceSchema.parse({
      source: 'local',
      path: '/Users/dev/marketplace',
    });
    if (full.source === 'local') {
      expect(full.path).toBe('/Users/dev/marketplace');
    }
  });

  it('DaemonUpdateSessionDefaultsRequestSchema parses a payload with a real CompactionModel value', () => {
    const req = DaemonUpdateSessionDefaultsRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.update_session_defaults',
      params: {
        modelId: ModelID.CLAUDE_OPUS_4_7,
        compactionModel: ModelID.CLAUDE_OPUS_4_7,
        compactionTokenLimit: 100_000,
      },
    });
    expect(req.method).toBe('daemon.update_session_defaults');
    expect(req.params.compactionModel).toBe('claude-opus-4-7');
  });

  it('DaemonUpdateSessionDefaultsRequestSchema rejects an unknown compactionModel string', () => {
    const result = DaemonUpdateSessionDefaultsRequestSchema.safeParse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.update_session_defaults',
      params: {
        compactionModel: 'not-a-real-model',
      },
    });
    expect(result.success).toBe(false);
  });
});
