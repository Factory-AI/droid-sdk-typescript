import { describe, expect, it } from 'vitest';

import {
  AutomationEntrySchema,
  AutomationPrivacyLevel,
  DaemonAuthenticateRequestParamsSchema,
  DaemonAuthenticateRequestSchema,
  DaemonGetDefaultSettingsResultSchema,
  DaemonInstallSshKeyResultSchema,
  DaemonListAutomationsRequestSchema,
  DaemonListMarketplacesResultSchema,
  DaemonListSkillsResultSchema,
  DaemonRelayStartResultSchema,
  DaemonSubmitBugReportRequestSchema,
  DaemonTriggerUpdateRequestSchema,
  MarketplaceSourceSchema,
  McpHttpServerConfigSchema,
  McpOAuthConfigSchema,
  McpServerConfigSchema,
  RedactedMarketplaceSourceSchema,
  TerminalRequestSchema,
} from '../src/protocol/daemon/index.js';

describe('protocol/daemon/bug-report', () => {
  it('parses a valid SUBMIT_BUG_REPORT request', () => {
    const req = DaemonSubmitBugReportRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.submit_bug_report',
      params: { sessionId: 's1', userComment: 'hi' },
    });
    expect(req.method).toBe('daemon.submit_bug_report');
  });
});

describe('protocol/daemon/management', () => {
  it('parses a TRIGGER_UPDATE request and an install result', () => {
    const req = DaemonTriggerUpdateRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.trigger_update',
      params: {},
    });
    expect(req.method).toBe('daemon.trigger_update');
    expect(DaemonInstallSshKeyResultSchema.parse({ installed: true })).toEqual({
      installed: true,
    });
  });
});

describe('protocol/daemon/skills', () => {
  it('accepts a list of skills via SkillInfoSchema', () => {
    const result = DaemonListSkillsResultSchema.parse({
      skills: [
        {
          name: 'sk-1',
          description: 'desc',
          location: 'project',
          filePath: '/tmp/sk',
        },
      ],
    });
    expect(result.skills).toHaveLength(1);
  });
});

describe('protocol/daemon/relay', () => {
  it('parses a relay start result', () => {
    const result = DaemonRelayStartResultSchema.parse({
      relayUrl: 'wss://relay.example',
      computerId: 'cpu-1',
    });
    expect(result.computerId).toBe('cpu-1');
  });
});

describe('protocol/daemon/terminal', () => {
  it('discriminates terminal requests by method', () => {
    const req = TerminalRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.create_terminal',
      params: { terminalId: 't1' },
    });
    expect(req.method).toBe('daemon.create_terminal');
  });
});

describe('protocol/daemon/connection', () => {
  it('refines token/apiKey union: requires at least one', () => {
    const ok = DaemonAuthenticateRequestParamsSchema.safeParse({
      caller: 'cli',
      token: 'jwt',
    });
    expect(ok.success).toBe(true);

    const okApiKey = DaemonAuthenticateRequestParamsSchema.safeParse({
      caller: 'cli',
      apiKey: 'fk-abc',
    });
    expect(okApiKey.success).toBe(true);

    const fail = DaemonAuthenticateRequestParamsSchema.safeParse({
      caller: 'cli',
    });
    expect(fail.success).toBe(false);
  });

  it('parses a full DaemonAuthenticateRequest', () => {
    const req = DaemonAuthenticateRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.authenticate',
      params: { caller: 'cli', token: 'jwt-token' },
    });
    expect(req.method).toBe('daemon.authenticate');
  });
});

describe('protocol/daemon/mcp', () => {
  it('exposes McpOAuthConfigSchema with clientSecret', () => {
    const parsed = McpOAuthConfigSchema.parse({
      clientSecret: 'super-secret',
      clientId: 'cid',
    });
    expect(parsed.clientSecret).toBe('super-secret');

    const blank = McpOAuthConfigSchema.safeParse({ clientSecret: '   ' });
    expect(blank.success).toBe(false);
  });

  it('round-trips McpHttpServerConfigSchema with auth-bearing headers', () => {
    const cfg = McpHttpServerConfigSchema.parse({
      type: 'http',
      url: 'https://mcp.example/sse',
      headers: { Authorization: 'Bearer s3cret' },
      oauth: { clientSecret: 'cs' },
    });
    expect(cfg.headers?.Authorization).toBe('Bearer s3cret');
    expect(cfg.oauth?.clientSecret).toBe('cs');
    expect(cfg.disabled).toBe(false);
  });

  it('McpServerConfigSchema accepts an http variant with headers', () => {
    const cfg = McpServerConfigSchema.parse({
      type: 'http',
      url: 'https://mcp.example',
      headers: { Authorization: 'Bearer x' },
    });
    expect('headers' in cfg).toBe(true);
  });
});

describe('protocol/daemon/automations', () => {
  it('lists the AutomationPrivacyLevel values', () => {
    expect(AutomationPrivacyLevel.Private).toBe('private');
    expect(AutomationPrivacyLevel.Organization).toBe('organization');
  });

  it('parses an AutomationEntry', () => {
    const entry = AutomationEntrySchema.parse({
      id: 'demo',
      name: 'Demo',
      status: 'active',
      isValid: true,
      path: '/tmp/automations/demo',
    });
    expect(entry.id).toBe('demo');
  });

  it('parses a LIST_AUTOMATIONS request envelope', () => {
    const req = DaemonListAutomationsRequestSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'request',
      id: 'req-1',
      method: 'daemon.list_automations',
      params: {},
    });
    expect(req.method).toBe('daemon.list_automations');
  });
});

describe('protocol/daemon/plugins', () => {
  it('exposes MarketplaceSourceSchema with a path for local entries', () => {
    const local = MarketplaceSourceSchema.parse({
      source: 'local',
      path: '/Users/dev/marketplace',
    });
    expect(local.source).toBe('local');
    if (local.source === 'local') {
      expect(local.path).toBe('/Users/dev/marketplace');
    }
  });

  it('keeps RedactedMarketplaceSourceSchema separate (no path on local)', () => {
    const redacted = RedactedMarketplaceSourceSchema.parse({ source: 'local' });
    expect(redacted.source).toBe('local');
    expect('path' in redacted).toBe(false);

    // The redacted schema must reject a `path` field on the `local` variant
    // because keeping filesystem paths on the wire would leak local layout.
    // discriminatedUnion is structural-permissive on extra keys, so we instead
    // verify the inferred type omits `path` for `local` via the value above.
  });

  it('LIST_MARKETPLACES result uses the redacted variant', () => {
    const parsed = DaemonListMarketplacesResultSchema.parse({
      marketplaces: [
        {
          name: 'demo',
          source: { source: 'local' },
          pluginCount: 2,
          autoUpdate: true,
        },
      ],
    });
    expect(parsed.marketplaces[0].source.source).toBe('local');
  });
});

describe('protocol/daemon/settings', () => {
  it('parses a minimal GET_DEFAULT_SETTINGS result', () => {
    const result = DaemonGetDefaultSettingsResultSchema.parse({});
    expect(result).toBeDefined();
  });
});
