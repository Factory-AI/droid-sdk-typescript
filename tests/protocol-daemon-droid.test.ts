import { describe, expect, it } from 'vitest';

import * as daemonModule from '../src/protocol/daemon/index.js';
import {
  ChildSessionAvailableNotificationSchema,
  DaemonAddUserMessageRequestParamsSchema,
  DaemonAddUserMessageRequestSchema,
  DaemonArchiveSessionRequestSchema,
  DaemonAskUserSchema,
  DaemonCloseSessionRequestSchema,
  DaemonCompactSessionRequestSchema,
  DaemonCreatePRRequestSchema,
  DaemonExecuteRewindRequestSchema,
  DaemonForkSessionRequestSchema,
  DaemonGenerateSemanticDiffRequestSchema,
  DaemonGetGitDiffDataSchema,
  DaemonGetGitDiffRequestSchema,
  DaemonGetGitDiffResultSchema,
  DaemonGetProxyTokenResponseSchema,
  DaemonGetProxyTokenResultSchema,
  DaemonGetRewindInfoRequestSchema,
  DaemonGetSemanticDiffCacheRequestSchema,
  DaemonGetSessionMessagesRequestSchema,
  DaemonGetWorkspaceFileContentRequestSchema,
  DaemonGitCommitRequestSchema,
  DaemonGitPushRequestSchema,
  DaemonInitializeSessionRequestParamsSchema,
  DaemonInitializeSessionRequestSchema,
  DaemonInterruptSessionRequestSchema,
  DaemonListAvailableSessionsRequestSchema,
  DaemonListFilesRequestSchema,
  DaemonListOpenedSessionsRequestSchema,
  DaemonLoadSessionRequestParamsSchema,
  DaemonLoadSessionRequestSchema,
  DaemonRenameSessionRequestSchema,
  DaemonRequestPermissionSchema,
  DaemonRequestSchema,
  DaemonSaveSemanticDiffCacheRequestSchema,
  DaemonSearchFilesRequestSchema,
  DaemonSearchSessionsRequestSchema,
  DaemonSessionNotificationSchema,
  DaemonUnarchiveSessionRequestSchema,
  DaemonValidateWorkingDirectoryRequestSchema,
  DaemonWarmupCacheRequestSchema,
  SessionInactivityNotificationSchema,
  SessionUnsubscribedNotificationSchema,
} from '../src/protocol/daemon/index.js';

const baseEnvelope = {
  jsonrpc: '2.0' as const,
  factoryApiVersion: '1.0.0',
  type: 'request' as const,
  id: 'req-1',
};

describe('protocol/daemon/droid representative schemas', () => {
  it('exports core session lifecycle request schemas', () => {
    expect(DaemonInitializeSessionRequestSchema).toBeDefined();
    expect(DaemonLoadSessionRequestSchema).toBeDefined();
    expect(DaemonAddUserMessageRequestSchema).toBeDefined();
    expect(DaemonInterruptSessionRequestSchema).toBeDefined();
    expect(DaemonCloseSessionRequestSchema).toBeDefined();
    expect(DaemonRenameSessionRequestSchema).toBeDefined();
    expect(DaemonArchiveSessionRequestSchema).toBeDefined();
    expect(DaemonUnarchiveSessionRequestSchema).toBeDefined();
    expect(DaemonForkSessionRequestSchema).toBeDefined();
    expect(DaemonCompactSessionRequestSchema).toBeDefined();
  });

  it('exports file/search/listing request schemas', () => {
    expect(DaemonListFilesRequestSchema).toBeDefined();
    expect(DaemonSearchFilesRequestSchema).toBeDefined();
    expect(DaemonSearchSessionsRequestSchema).toBeDefined();
    expect(DaemonListAvailableSessionsRequestSchema).toBeDefined();
    expect(DaemonListOpenedSessionsRequestSchema).toBeDefined();
    expect(DaemonGetSessionMessagesRequestSchema).toBeDefined();
    expect(DaemonGetWorkspaceFileContentRequestSchema).toBeDefined();
  });

  it('exports git/PR/semantic diff request schemas', () => {
    expect(DaemonGetGitDiffRequestSchema).toBeDefined();
    expect(DaemonGitPushRequestSchema).toBeDefined();
    expect(DaemonGitCommitRequestSchema).toBeDefined();
    expect(DaemonCreatePRRequestSchema).toBeDefined();
    expect(DaemonGetSemanticDiffCacheRequestSchema).toBeDefined();
    expect(DaemonSaveSemanticDiffCacheRequestSchema).toBeDefined();
    expect(DaemonGenerateSemanticDiffRequestSchema).toBeDefined();
  });

  it('exports rewind / validation request schemas', () => {
    expect(DaemonGetRewindInfoRequestSchema).toBeDefined();
    expect(DaemonExecuteRewindRequestSchema).toBeDefined();
    expect(DaemonValidateWorkingDirectoryRequestSchema).toBeDefined();
    expect(DaemonWarmupCacheRequestSchema).toBeDefined();
  });

  it('parses a representative INITIALIZE_SESSION request', () => {
    const req = DaemonInitializeSessionRequestSchema.parse({
      ...baseEnvelope,
      method: 'daemon.initialize_session',
      params: { token: 'tok', machineId: 'm1', cwd: '/tmp' },
    });
    expect(req.method).toBe('daemon.initialize_session');
  });
});

describe('protocol/daemon/droid secret-bearing schemas', () => {
  it('DaemonInitializeSessionRequestParamsSchema requires a token', () => {
    const parsed = DaemonInitializeSessionRequestParamsSchema.parse({
      token: 'jwt-token',
      machineId: 'm1',
      cwd: '/tmp',
    });
    expect(parsed.token).toBe('jwt-token');

    const missing = DaemonInitializeSessionRequestParamsSchema.safeParse({
      machineId: 'm1',
      cwd: '/tmp',
    });
    expect(missing.success).toBe(false);
  });

  it('DaemonLoadSessionRequestParamsSchema requires a token', () => {
    const parsed = DaemonLoadSessionRequestParamsSchema.parse({
      token: 'jwt-token',
      sessionId: 'sess-1',
    });
    expect(parsed.token).toBe('jwt-token');

    const missing = DaemonLoadSessionRequestParamsSchema.safeParse({
      sessionId: 'sess-1',
    });
    expect(missing.success).toBe(false);
  });

  it('DaemonGetProxyTokenResultSchema carries a token string', () => {
    const parsed = DaemonGetProxyTokenResultSchema.parse({ token: 'proxy-1' });
    expect(parsed.token).toBe('proxy-1');

    const response = DaemonGetProxyTokenResponseSchema.parse({
      jsonrpc: '2.0',
      factoryApiVersion: '1.0.0',
      type: 'response',
      id: 'req-1',
      result: { token: 'proxy-2' },
    });
    const result = (response as { result?: { token?: string } }).result;
    expect(result?.token).toBe('proxy-2');
  });
});

describe('protocol/daemon/droid notification schemas', () => {
  it('parses SessionInactivityNotificationSchema', () => {
    const parsed = SessionInactivityNotificationSchema.parse({
      type: 'session_inactivity',
      message: 'idle',
      timestamp: 1700000000,
      timeoutSeconds: 600,
    });
    expect(parsed.type).toBe('session_inactivity');
    expect(parsed.timeoutSeconds).toBe(600);
  });

  it('parses SessionUnsubscribedNotificationSchema', () => {
    const parsed = SessionUnsubscribedNotificationSchema.parse({
      type: 'session_unsubscribed',
      message: 'another client took over',
    });
    expect(parsed.type).toBe('session_unsubscribed');
  });

  it('parses ChildSessionAvailableNotificationSchema', () => {
    const parsed = ChildSessionAvailableNotificationSchema.parse({
      type: 'child_session_available',
      childSessionId: 'child-1',
      timestamp: 1700000001,
    });
    expect(parsed.childSessionId).toBe('child-1');
  });
});

describe('protocol/daemon/droid DaemonRequestSchema discriminated union', () => {
  it('round-trips a droid.ts method (close_session)', () => {
    const req = DaemonRequestSchema.parse({
      ...baseEnvelope,
      method: 'daemon.close_session',
      params: { sessionId: 'sess-1' },
    });
    expect(req.method).toBe('daemon.close_session');
  });

  it('round-trips a mcp.ts sibling method (get_mcp_config)', () => {
    const req = DaemonRequestSchema.parse({
      ...baseEnvelope,
      method: 'daemon.get_mcp_config',
      params: {},
    });
    expect(req.method).toBe('daemon.get_mcp_config');
  });

  it('round-trips a plugins.ts sibling method (list_marketplaces)', () => {
    const req = DaemonRequestSchema.parse({
      ...baseEnvelope,
      method: 'daemon.list_marketplaces',
      params: { sessionId: 'sess-1' },
    });
    expect(req.method).toBe('daemon.list_marketplaces');
  });

  it('rejects an unknown method', () => {
    const result = DaemonRequestSchema.safeParse({
      ...baseEnvelope,
      method: 'daemon.not_a_real_method',
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ['daemon.list_commands', { sessionId: 'sess-1' }],
    [
      'daemon.list_crons',
      { sessionId: 'sess-1', includeInactive: false },
    ],
    [
      'daemon.create_cron',
      {
        kind: 'session_prompt',
        source: 'cron_tool',
        scope: { type: 'session', sessionId: 'sess-1', sessionCwd: '/tmp' },
        schedule: { expression: '* * * * *', recurring: true },
        payload: {
          type: 'prompt',
          prompt: 'do work',
          target: { type: 'same_session' },
        },
      },
    ],
    [
      'daemon.update_cron',
      { cronId: 'abc', status: 'paused' },
    ],
    [
      'daemon.delete_cron',
      { cronId: 'abc' },
    ],
    [
      'daemon.hold_session_crons',
      { sessionId: 'sess-1', reason: 'inactive' },
    ],
    [
      'daemon.resume_session_crons',
      { sessionId: 'sess-1' },
    ],
  ] as const)(
    'accepts the new method literal %s',
    (method, params) => {
      const req = DaemonRequestSchema.parse({
        ...baseEnvelope,
        method,
        params,
      });
      expect(req.method).toBe(method);
    }
  );

  it.each([
    'daemon.start_loop',
    'daemon.stop_loop',
    'daemon.get_loop_status',
    'daemon.run_loop_now',
  ])('rejects the retired loop method literal %s', (method) => {
    const result = DaemonRequestSchema.safeParse({
      ...baseEnvelope,
      method,
      params: { sessionId: 'sess-1' },
    });
    expect(result.success).toBe(false);
  });
});

describe('protocol/daemon/droid DaemonGetGitDiffResultSchema legacy preprocess', () => {
  const currentShapeData = {
    diff: 'diff-text',
    branch: 'feature',
    baseBranch: 'main',
    files: [{ path: 'a.ts', additions: 1, deletions: 2, status: 'modified' }],
    totalAdditions: 1,
    totalDeletions: 2,
    remoteUrl: null,
    commits: [{ hash: 'abc', message: 'msg' }],
  };

  it('parses the current discriminated-union success shape', () => {
    const parsed = DaemonGetGitDiffResultSchema.parse({
      success: true,
      data: currentShapeData,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.branch).toBe('feature');
      expect(parsed.data.unstagedDiff).toBe('');
      expect(parsed.data.unstagedFiles).toEqual([]);
    }
  });

  it('parses the unavailable variant', () => {
    const parsed = DaemonGetGitDiffResultSchema.parse({
      success: false,
      unavailableReason: 'not_git_repository',
      unavailableMessage: 'not a git repo',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.unavailableReason).toBe('not_git_repository');
    }
  });

  it('upgrades legacy bare-data shape into the success variant', () => {
    const legacyInput = {
      diff: 'legacy-diff',
      branch: 'legacy-branch',
      baseBranch: 'main',
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      remoteUrl: null,
      commits: [],
    };
    const parsed = DaemonGetGitDiffResultSchema.parse(legacyInput);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.diff).toBe('legacy-diff');
      expect(parsed.data.unstagedDiff).toBe('');
      expect(parsed.data.unstagedFiles).toEqual([]);
      // The legacy data must round-trip through the canonical data schema
      const canonical = DaemonGetGitDiffDataSchema.parse(legacyInput);
      expect(parsed.data).toEqual(canonical);
    }
  });

  it('coerces an unknown unavailableReason to Unknown', () => {
    const parsed = DaemonGetGitDiffResultSchema.parse({
      success: false,
      unavailableReason: 'totally-not-a-real-reason',
      unavailableMessage: 'huh',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.unavailableReason).toBe('unknown');
    }
  });
});

describe('protocol/daemon/droid module surface', () => {
  it('does NOT export private createResponseSchema helpers', () => {
    const keys = Object.keys(daemonModule);
    expect(keys).not.toContain('createResponseSchema');
    expect(keys).not.toContain('createAckCompatibleResponseSchema');
    expect(
      (daemonModule as Record<string, unknown>).createResponseSchema
    ).toBeUndefined();
    expect(
      (daemonModule as Record<string, unknown>)
        .createAckCompatibleResponseSchema
    ).toBeUndefined();
  });

  it('exposes the session-notification + permission + ask-user JSON-RPC envelopes', () => {
    expect(DaemonSessionNotificationSchema).toBeDefined();
    expect(DaemonRequestPermissionSchema).toBeDefined();
    expect(DaemonAskUserSchema).toBeDefined();
  });

  it('DaemonAddUserMessageRequestParamsSchema requires sessionId on top of base params', () => {
    const fail = DaemonAddUserMessageRequestParamsSchema.safeParse({
      // missing sessionId
      text: 'hi',
    });
    expect(fail.success).toBe(false);

    const ok = DaemonAddUserMessageRequestParamsSchema.parse({
      sessionId: 'sess-1',
      text: 'hi',
    });
    expect(ok.sessionId).toBe('sess-1');
  });
});
