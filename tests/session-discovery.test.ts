import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DecompSessionType } from '../src/schemas/enums.js';
import {
  listSessions,
  sanitizePathToDirectoryName,
  getDefaultSessionsDir,
} from '../src/session-discovery.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'droid-sdk-test-'));
}

function writeSession(
  dir: string,
  sessionId: string,
  startEvent: Record<string, unknown>,
  extraLines: string[] = []
): string {
  const lines = [JSON.stringify(startEvent), ...extraLines].join('\n') + '\n';
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(filePath, lines);
  return filePath;
}

function writeSettings(
  dir: string,
  sessionId: string,
  settings: Record<string, unknown>
): void {
  fs.writeFileSync(
    path.join(dir, `${sessionId}.settings.json`),
    JSON.stringify(settings)
  );
}

function writeFavorites(sessionsDir: string, ids: string[]): void {
  fs.writeFileSync(path.join(sessionsDir, '.favorites'), JSON.stringify(ids));
}

function makeStartEvent(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: 'session_start',
    title: 'Test Session',
    owner: 'test-user',
    cwd: '/test/project',
    ...overrides,
  };
}

describe('sanitizePathToDirectoryName', () => {
  it('converts absolute path to hyphen-separated name', () => {
    const result = sanitizePathToDirectoryName('/Users/me/project');
    expect(result).toBe('-Users-me-project');
  });

  it('strips trailing slashes', () => {
    const result = sanitizePathToDirectoryName('/Users/me/project/');
    expect(result).toBe('-Users-me-project');
  });

  it('handles nested paths', () => {
    const result = sanitizePathToDirectoryName('/a/b/c/d/e');
    expect(result).toBe('-a-b-c-d-e');
  });

  it('handles root path', () => {
    const result = sanitizePathToDirectoryName('/');
    expect(result).toMatch(/^-/);
  });

  it('falls back to absolutePath when realpathSync throws (non-existent path)', () => {
    // realpathSync will throw for a path that doesn't exist on disk,
    // exercising the catch fallback in sanitizePathToDirectoryName.
    const result = sanitizePathToDirectoryName(
      '/nonexistent/path/that/does/not/exist'
    );
    expect(result).toBe('-nonexistent-path-that-does-not-exist');
  });

  it('expands tilde paths', () => {
    const result = sanitizePathToDirectoryName('~/projects/foo');
    expect(result).not.toContain('~');
    expect(result).toMatch(/^-/);
  });
});

describe('getDefaultSessionsDir', () => {
  it('returns path under home directory', () => {
    const result = getDefaultSessionsDir();
    expect(result).toBe(path.join(os.homedir(), '.factory', 'sessions'));
  });
});

describe('listSessions', () => {
  let sessionsDir: string;

  beforeEach(() => {
    sessionsDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  });

  it('returns empty array for non-existent sessionsDir', async () => {
    const result = await listSessions({
      sessionsDir: '/tmp/does-not-exist-xyz-test',
      fetchOutsideCWD: true,
    });
    expect(result).toEqual([]);
  });

  it('returns empty array for empty sessionsDir', async () => {
    const result = await listSessions({
      sessionsDir,
      fetchOutsideCWD: true,
    });
    expect(result).toEqual([]);
  });

  it('discovers sessions in a project subdirectory', async () => {
    const cwd = '/test/my-project';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'sess-1', makeStartEvent({ cwd }));
    writeSession(
      projectDir,
      'sess-2',
      makeStartEvent({ cwd, title: 'Second' })
    );

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual(['sess-1', 'sess-2']);
  });

  it('returns sessions sorted by modifiedTime descending', async () => {
    const cwd = '/test/sorted';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'old', makeStartEvent({ cwd }));
    // Ensure different mtime by writing after a brief delay
    const newerPath = writeSession(
      projectDir,
      'new',
      makeStartEvent({ cwd, title: 'Newer' })
    );
    // Touch the file to ensure it has a later mtime
    const futureTime = new Date(Date.now() + 10_000);
    fs.utimesSync(newerPath, futureTime, futureTime);

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('new');
    expect(result[1]!.id).toBe('old');
  });

  it('respects numSessions cap', async () => {
    const projectDir = path.join(sessionsDir, '-all');
    fs.mkdirSync(projectDir, { recursive: true });

    for (let i = 0; i < 5; i++) {
      writeSession(projectDir, `sess-${i}`, makeStartEvent({ cwd: '/all' }));
    }

    const result = await listSessions({
      sessionsDir,
      fetchOutsideCWD: true,
      numSessions: 3,
    });
    expect(result).toHaveLength(3);
  });

  it('excludes archived sessions', async () => {
    const cwd = '/test/archived';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'active', makeStartEvent({ cwd }));
    writeSession(projectDir, 'archived', makeStartEvent({ cwd }));
    writeSettings(projectDir, 'archived', {
      archivedAt: '2024-01-01T00:00:00Z',
    });

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('active');
  });

  it('marks favorites correctly', async () => {
    const cwd = '/test/favs';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'fav-1', makeStartEvent({ cwd }));
    writeSession(projectDir, 'not-fav', makeStartEvent({ cwd }));
    writeFavorites(sessionsDir, ['fav-1']);

    const result = await listSessions({ sessionsDir, cwd });
    const fav = result.find((s) => s.id === 'fav-1');
    const notFav = result.find((s) => s.id === 'not-fav');
    expect(fav!.isFavorite).toBe(true);
    expect(notFav!.isFavorite).toBe(false);
  });

  it('counts messages correctly (non-empty lines minus session_start)', async () => {
    const cwd = '/test/msgcount';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'counted', makeStartEvent({ cwd }), [
      JSON.stringify({ type: 'user_message', text: 'hello' }),
      JSON.stringify({ type: 'assistant_message', text: 'hi' }),
      '', // empty line — should not count
      JSON.stringify({ type: 'user_message', text: 'bye' }),
    ]);

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.messageCount).toBe(3);
  });

  it('skips files with invalid first-line JSON', async () => {
    const cwd = '/test/invalid';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    fs.writeFileSync(path.join(projectDir, 'bad.jsonl'), 'this is not json\n');
    writeSession(projectDir, 'good', makeStartEvent({ cwd }));

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('good');
  });

  it('skips files where first line is not a session_start event', async () => {
    const cwd = '/test/nostart';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    fs.writeFileSync(
      path.join(projectDir, 'wrong.jsonl'),
      JSON.stringify({ type: 'user_message', text: 'hi' }) + '\n'
    );
    writeSession(projectDir, 'valid', makeStartEvent({ cwd }));

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('valid');
  });

  it('fetchOutsideCWD returns sessions from all project subdirectories', async () => {
    const dir1 = path.join(sessionsDir, '-project-one');
    const dir2 = path.join(sessionsDir, '-project-two');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    writeSession(dir1, 'sess-a', makeStartEvent({ cwd: '/project/one' }));
    writeSession(dir2, 'sess-b', makeStartEvent({ cwd: '/project/two' }));

    const result = await listSessions({
      sessionsDir,
      fetchOutsideCWD: true,
    });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual(['sess-a', 'sess-b']);
  });

  it('extracts metadata fields correctly', async () => {
    const cwd = '/test/metadata';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(
      projectDir,
      'meta-1',
      makeStartEvent({
        cwd,
        title: 'My Title',
        sessionTitle: 'Session Title',
        owner: 'alice',
      })
    );

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    const s = result[0]!;
    expect(s.id).toBe('meta-1');
    expect(s.title).toBe('My Title');
    expect(s.sessionTitle).toBe('Session Title');
    expect(s.owner).toBe('alice');
    expect(s.cwd).toBe(cwd);
    expect(s.modifiedTime).toBeInstanceOf(Date);
    expect(s.createdTime).toBeInstanceOf(Date);
  });

  it('extracts decompSessionType from session_start event', async () => {
    const cwd = '/test/decomp';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(
      projectDir,
      'orch-1',
      makeStartEvent({
        cwd,
        decompSessionType: DecompSessionType.Orchestrator,
        decompMissionId: 'mission-abc',
      })
    );

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.decompSessionType).toBe(DecompSessionType.Orchestrator);
    expect(result[0]!.decompMissionId).toBe('mission-abc');
  });

  it('extracts mission metadata from settings tags', async () => {
    const cwd = '/test/tags';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'tagged', makeStartEvent({ cwd }));
    writeSettings(projectDir, 'tagged', {
      tags: [
        { name: 'mission:build', metadata: { missionId: 'mission-xyz' } },
        {
          name: 'decompSessionType',
          metadata: { value: DecompSessionType.Worker },
        },
      ],
    });

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.decompMissionId).toBe('mission-xyz');
    expect(result[0]!.decompSessionType).toBe(DecompSessionType.Worker);
  });

  it('defaults title and owner to empty strings when missing', async () => {
    const cwd = '/test/defaults';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    writeSession(projectDir, 'minimal', {
      type: 'session_start',
      cwd,
    });

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('');
    expect(result[0]!.owner).toBe('');
  });

  it('deduplicates sessions appearing in both legacy root and project subdir', async () => {
    const cwd = '/test/dedup';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    // Same session ID in both legacy root and project dir
    writeSession(sessionsDir, 'dup-1', makeStartEvent({ cwd }));
    const newerPath = writeSession(
      projectDir,
      'dup-1',
      makeStartEvent({ cwd, title: 'Newer copy' })
    );
    const futureTime = new Date(Date.now() + 10_000);
    fs.utimesSync(newerPath, futureTime, futureTime);

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('dup-1');
    expect(result[0]!.title).toBe('Newer copy');
  });

  it('ignores non-.jsonl files', async () => {
    const cwd = '/test/nonjsonl';
    const projectDir = path.join(sessionsDir, sanitizePathToDirectoryName(cwd));
    fs.mkdirSync(projectDir, { recursive: true });

    fs.writeFileSync(path.join(projectDir, 'readme.txt'), 'not a session');
    fs.writeFileSync(path.join(projectDir, 'data.json'), '{}');
    writeSession(projectDir, 'real', makeStartEvent({ cwd }));

    const result = await listSessions({ sessionsDir, cwd });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('real');
  });

  it('delegates to remote API when apiKey is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          sessions: [
            {
              sessionId: 'remote-001',
              title: 'Remote session',
              status: 'idle',
              messageCount: 5,
              createdAt: 1700000000000,
              updatedAt: 1700000060000,
              computerId: 'comp-001',
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      const result = await listSessions({ apiKey: 'fk-test-key' });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.factory.ai/api/v0/sessions');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('remote-001');
      expect(result[0]!.title).toBe('Remote session');
      expect(result[0]!.messageCount).toBe(5);
      expect(result[0]!.modifiedTime).toEqual(new Date(1700000060000));
      expect(result[0]!.createdTime).toEqual(new Date(1700000000000));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes computerId and numSessions to remote API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          sessions: [],
          pagination: { hasMore: false, nextCursor: null },
        }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;

    try {
      await listSessions({
        apiKey: 'fk-test-key',
        computerId: 'comp-001',
        numSessions: 5,
      });

      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain('computerId=comp-001');
      expect(url).toContain('limit=5');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
