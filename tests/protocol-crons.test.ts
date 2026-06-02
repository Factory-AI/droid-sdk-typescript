import { describe, expect, it } from 'vitest';

import {
  CronCreateToolInputSchema,
  CronDeleteToolInputSchema,
  CronListToolInputSchema,
} from '../src/protocol/crons.js';
import {
  CronCreateScopeSchema,
  CronRecordSchema,
  CronScopeSchema,
  CronStatusSchema,
  DaemonCreateCronRequestSchema,
  DaemonCreateCronResultSchema,
  DaemonCronStateChangedNotificationSchema,
  DaemonDeleteCronRequestSchema,
  DaemonDeleteCronResultSchema,
  DaemonHoldSessionCronsRequestSchema,
  DaemonHoldSessionCronsResultSchema,
  DaemonListCronsRequestSchema,
  DaemonListCronsResultSchema,
  DaemonResumeSessionCronsRequestSchema,
  DaemonResumeSessionCronsResultSchema,
  DaemonUpdateCronRequestSchema,
  DaemonUpdateCronResultSchema,
} from '../src/protocol/daemon/crons.js';

const envelope = {
  jsonrpc: '2.0' as const,
  factoryApiVersion: '1.0.0',
};

const sampleCronRecord = {
  version: 1 as const,
  id: 'abc12345',
  kind: 'session_prompt' as const,
  status: 'active' as const,
  source: 'cron_tool' as const,
  scope: {
    type: 'session' as const,
    sessionId: 'sess-1',
    sessionCwd: '/tmp/work',
    storageDir: '/var/cron',
  },
  schedule: {
    expression: '*/5 * * * *',
    recurring: true,
    timezone: 'UTC' as const,
  },
  runPolicy: { whenSessionInactive: 'hold' as const },
  payload: {
    type: 'prompt' as const,
    prompt: 'do the thing',
    target: { type: 'same_session' as const },
  },
  stats: { fireCount: 0 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('protocol/crons tool-input schemas', () => {
  it('CronCreateToolInputSchema parses a recurring once-a-minute job', () => {
    const input = CronCreateToolInputSchema.parse({
      expression: '* * * * *',
      job: { type: 'prompt', prompt: 'ping' },
      recurring: true,
    });
    expect(input.expression).toBe('* * * * *');
    expect(input.job.prompt).toBe('ping');
  });

  it('CronCreateToolInputSchema rejects a malformed expression', () => {
    expect(() =>
      CronCreateToolInputSchema.parse({
        expression: 'not-a-cron',
        job: { type: 'prompt', prompt: 'ping' },
        recurring: true,
      })
    ).toThrow();
  });

  it('CronDeleteToolInputSchema requires an 8-char cronId', () => {
    expect(
      CronDeleteToolInputSchema.parse({ cronId: 'abcd1234' }).cronId
    ).toBe('abcd1234');
    expect(() =>
      CronDeleteToolInputSchema.parse({ cronId: 'short' })
    ).toThrow();
  });

  it('CronListToolInputSchema accepts an empty object', () => {
    expect(CronListToolInputSchema.parse({})).toEqual({});
  });
});

describe('protocol/daemon crons leaf schemas', () => {
  it('CronStatusSchema accepts known statuses and rejects unknown', () => {
    expect(CronStatusSchema.parse('active')).toBe('active');
    expect(CronStatusSchema.parse('held')).toBe('held');
    expect(() => CronStatusSchema.parse('nope')).toThrow();
  });

  it('CronCreateScopeSchema rejects when storageDir is provided', () => {
    const ok = CronCreateScopeSchema.parse({
      type: 'session',
      sessionId: 'sess-1',
      sessionCwd: '/tmp',
    });
    expect(ok.sessionId).toBe('sess-1');
  });

  it('CronScopeSchema requires storageDir', () => {
    const ok = CronScopeSchema.parse({
      type: 'session',
      sessionId: 'sess-1',
      sessionCwd: '/tmp',
      storageDir: '/var',
    });
    expect(ok.storageDir).toBe('/var');

    expect(() =>
      CronScopeSchema.parse({
        type: 'session',
        sessionId: 'sess-1',
        sessionCwd: '/tmp',
      })
    ).toThrow();
  });

  it('CronRecordSchema round-trips a full record', () => {
    const parsed = CronRecordSchema.parse(sampleCronRecord);
    expect(parsed.id).toBe('abc12345');
    expect(parsed.schedule.timezone).toBe('UTC');
  });
});

describe('protocol/daemon crons RPC request schemas', () => {
  it('DaemonListCronsRequestSchema parses with daemon.list_crons method', () => {
    const req = DaemonListCronsRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.list_crons',
      params: { sessionId: 'sess-1' },
    });
    expect(req.method).toBe('daemon.list_crons');
  });

  it('DaemonCreateCronRequestSchema parses with daemon.create_cron method', () => {
    const req = DaemonCreateCronRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.create_cron',
      params: {
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
    });
    expect(req.method).toBe('daemon.create_cron');
  });

  it('DaemonUpdateCronRequestSchema parses with daemon.update_cron method', () => {
    const req = DaemonUpdateCronRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.update_cron',
      params: { cronId: 'abc12345', status: 'paused' },
    });
    expect(req.method).toBe('daemon.update_cron');
  });

  it('DaemonDeleteCronRequestSchema parses with daemon.delete_cron method', () => {
    const req = DaemonDeleteCronRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.delete_cron',
      params: { cronId: 'abc12345' },
    });
    expect(req.method).toBe('daemon.delete_cron');
  });

  it('DaemonHoldSessionCronsRequestSchema parses with daemon.hold_session_crons method', () => {
    const req = DaemonHoldSessionCronsRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.hold_session_crons',
      params: { sessionId: 'sess-1', reason: 'inactive' },
    });
    expect(req.method).toBe('daemon.hold_session_crons');
  });

  it('DaemonResumeSessionCronsRequestSchema parses with daemon.resume_session_crons method', () => {
    const req = DaemonResumeSessionCronsRequestSchema.parse({
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'daemon.resume_session_crons',
      params: { sessionId: 'sess-1' },
    });
    expect(req.method).toBe('daemon.resume_session_crons');
  });
});

describe('protocol/daemon crons result schemas', () => {
  it('DaemonListCronsResultSchema parses', () => {
    expect(
      DaemonListCronsResultSchema.parse({ crons: [sampleCronRecord] }).crons
    ).toHaveLength(1);
  });

  it('DaemonCreateCronResultSchema parses', () => {
    expect(
      DaemonCreateCronResultSchema.parse({ cron: sampleCronRecord }).cron.id
    ).toBe('abc12345');
  });

  it('DaemonUpdateCronResultSchema accepts a nullable record', () => {
    expect(DaemonUpdateCronResultSchema.parse({ cron: null }).cron).toBeNull();
    expect(
      DaemonUpdateCronResultSchema.parse({ cron: sampleCronRecord }).cron?.id
    ).toBe('abc12345');
  });

  it('DaemonDeleteCronResultSchema parses', () => {
    expect(DaemonDeleteCronResultSchema.parse({ deleted: true }).deleted).toBe(
      true
    );
  });

  it('DaemonHoldSessionCronsResultSchema parses', () => {
    expect(
      DaemonHoldSessionCronsResultSchema.parse({ heldCount: 3 }).heldCount
    ).toBe(3);
  });

  it('DaemonResumeSessionCronsResultSchema parses', () => {
    expect(
      DaemonResumeSessionCronsResultSchema.parse({ resumedCount: 2 })
        .resumedCount
    ).toBe(2);
  });
});

describe('protocol/daemon crons notification schema', () => {
  it.each(['created', 'updated', 'deleted'] as const)(
    'DaemonCronStateChangedNotificationSchema accepts reason=%s',
    (reason) => {
      const notif = DaemonCronStateChangedNotificationSchema.parse({
        ...envelope,
        type: 'notification',
        method: 'daemon.cron.state_changed',
        params: { reason, cronIds: ['abc'] },
      });
      expect(notif.params.reason).toBe(reason);
    }
  );
});
