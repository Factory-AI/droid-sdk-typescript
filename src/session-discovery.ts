import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { listRemoteSessions } from './api.js';
import {
  SessionSettingsFileSchema,
  SessionStartEventSchema,
  type SessionMetadata,
  type SessionSettingsFile,
  type SessionStartEvent,
  type ListSessionsOptions,
} from './schemas/session-metadata.js';

const FAVORITES_FILE = '.favorites';
const SESSION_EXTENSION = '.jsonl';
const SETTINGS_SUFFIX = '.settings.json';
const MISSION_TAG_PREFIX = 'mission:';
const MISSION_ID_METADATA_KEY = 'missionId';
const DECOMP_SESSION_TYPE_TAG = 'decompSessionType';
const DECOMP_SESSION_TYPE_METADATA_KEY = 'value';

// Byte constants for the byte-level scanner.
const LF = 0x0a;
const CR = 0x0d;
const SPACE = 0x20;
const TAB = 0x09;

// When `numSessions` is set, stat every candidate then parse only the top
// N. Parse failures force us to drop further down the stat-sorted list —
// oversample so we rarely have to re-dip.
const PARSE_OVERSAMPLE = 20;

/**
 * Read a file into a Buffer, returning `null` if it doesn't exist or can't
 * be read. Avoids a TOCTOU `existsSync` pre-check.
 */
function readFileBuffer(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/** Parse a Buffer as JSON, returning `null` on failure. */
function parseJsonBuffer(buf: Buffer): unknown {
  try {
    return JSON.parse(buf.toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Walk a Buffer byte-by-byte to extract the first line and count non-empty
 * lines. Avoids allocating a full UTF-8 string for potentially large
 * session files.
 */
function scanBufferForLines(buf: Buffer): {
  firstLine: Buffer;
  nonEmptyLineCount: number;
} {
  let nonEmptyLineCount = 0;
  let firstLineEnd = -1;
  let currentLineHasContent = false;

  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (ch === LF) {
      if (currentLineHasContent) nonEmptyLineCount++;
      if (firstLineEnd === -1) firstLineEnd = i;
      currentLineHasContent = false;
    } else if (ch !== CR && ch !== SPACE && ch !== TAB) {
      currentLineHasContent = true;
    }
  }
  if (currentLineHasContent) nonEmptyLineCount++;

  // Trim trailing CR from the first line if the file uses CRLF.
  const end =
    firstLineEnd === -1
      ? buf.length
      : firstLineEnd > 0 && buf[firstLineEnd - 1] === CR
        ? firstLineEnd - 1
        : firstLineEnd;

  return {
    firstLine: buf.subarray(0, end),
    nonEmptyLineCount,
  };
}

function loadFavorites(sessionsDir: string): Set<string> {
  const buf = readFileBuffer(path.join(sessionsDir, FAVORITES_FILE));
  if (!buf) return new Set();
  const parsed = parseJsonBuffer(buf);
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.filter((id): id is string => typeof id === 'string'));
}

function loadSettingsFile(
  directory: string,
  sessionId: string
): SessionSettingsFile | null {
  const buf = readFileBuffer(
    path.join(directory, `${sessionId}${SETTINGS_SUFFIX}`)
  );
  if (!buf) return null;
  const parsed = parseJsonBuffer(buf);
  if (parsed === null) return null;
  const result = SessionSettingsFileSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function getMissionMetadataFromTags(settings: SessionSettingsFile | null): {
  decompMissionId?: string;
  decompSessionType?: string;
} {
  if (!settings?.tags) return {};

  const missionTag = settings.tags.find((tag) =>
    tag.name.startsWith(MISSION_TAG_PREFIX)
  );
  const roleTag = settings.tags.find(
    (tag) => tag.name === DECOMP_SESSION_TYPE_TAG
  );

  return {
    decompMissionId: missionTag?.metadata?.[MISSION_ID_METADATA_KEY],
    decompSessionType: roleTag?.metadata?.[DECOMP_SESSION_TYPE_METADATA_KEY],
  };
}

interface SessionCandidate {
  sessionId: string;
  sessionPath: string;
  directory: string;
  /** Names of sibling files in `directory` — used to skip settings probe. */
  siblingNames: Set<string>;
  /** Cached stat, populated eagerly in the stat-first pre-pass. */
  stats: fs.Stats;
}

interface ParseContext {
  favorites: Set<string>;
  /**
   * When set, candidates whose embedded `cwd` doesn't match (after
   * resolution) are rejected early. Used to filter legacy-global files.
   */
  requiredCwd?: string;
}

/**
 * Parse a single session `.jsonl` file into a {@link SessionMetadata}.
 * Returns `null` if the file can't be read, isn't a valid session_start
 * event, is archived, or (when `requiredCwd` is set) doesn't match.
 */
function parseSessionFile(
  candidate: SessionCandidate,
  ctx: ParseContext
): SessionMetadata | null {
  const buf = readFileBuffer(candidate.sessionPath);
  if (!buf) return null;

  const scanned = scanBufferForLines(buf);

  const firstParsed = parseJsonBuffer(scanned.firstLine);
  if (firstParsed === null) return null;

  const firstResult = SessionStartEventSchema.safeParse(firstParsed);
  if (!firstResult.success) return null;
  const summary: SessionStartEvent = firstResult.data;

  // Early reject legacy-global sessions that don't belong to the cwd we
  // want, before touching the settings file.
  if (
    ctx.requiredCwd !== undefined &&
    (summary.cwd === undefined || path.resolve(summary.cwd) !== ctx.requiredCwd)
  ) {
    return null;
  }

  // Only read <sessionId>.settings.json if it actually exists — we already
  // have the directory listing and can tell.
  const settingsName = `${candidate.sessionId}${SETTINGS_SUFFIX}`;
  const settings = candidate.siblingNames.has(settingsName)
    ? loadSettingsFile(candidate.directory, candidate.sessionId)
    : null;
  if (settings?.archivedAt) return null;

  const tagMeta = getMissionMetadataFromTags(settings);
  const decompSessionType =
    summary.decompSessionType ??
    SessionStartEventSchema.shape.decompSessionType.safeParse(
      tagMeta.decompSessionType
    ).data;

  // messageCount = non-empty lines minus the session_start line.
  const messageCount = Math.max(0, scanned.nonEmptyLineCount - 1);

  return {
    id: candidate.sessionId,
    title: summary.title ?? '',
    sessionTitle: summary.sessionTitle,
    owner: summary.owner ?? '',
    messageCount,
    modifiedTime: candidate.stats.mtime,
    createdTime: candidate.stats.birthtime || candidate.stats.ctime,
    isFavorite: ctx.favorites.has(candidate.sessionId),
    cwd: summary.cwd,
    decompSessionType,
    decompMissionId: tagMeta.decompMissionId ?? summary.decompMissionId,
  };
}

function readDirEntries(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Stat every `.jsonl` in `directory` (from its already-listed `entries`)
 * and return candidate records. No file contents are read yet — this is
 * the cheap pre-pass that lets `numSessions` avoid parsing every file on
 * disk.
 */
function collectCandidates(
  directory: string,
  entries: fs.Dirent[]
): SessionCandidate[] {
  const siblingNames = new Set(entries.map((e) => e.name));
  const candidates: SessionCandidate[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith(SESSION_EXTENSION)) continue;

    const sessionPath = path.join(directory, entry.name);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(sessionPath);
    } catch {
      continue;
    }
    candidates.push({
      sessionId: entry.name.slice(0, -SESSION_EXTENSION.length),
      sessionPath,
      directory,
      siblingNames,
      stats,
    });
  }

  return candidates;
}

/**
 * Parse `candidates` in order until we have `limit` valid sessions (or run
 * out). When `limit` is undefined, parse everything.
 */
function parseUpTo(
  candidates: SessionCandidate[],
  ctx: ParseContext,
  limit?: number
): SessionMetadata[] {
  const out: SessionMetadata[] = [];
  for (const candidate of candidates) {
    if (limit !== undefined && out.length >= limit) break;
    const metadata = parseSessionFile(candidate, ctx);
    if (metadata) out.push(metadata);
  }
  return out;
}

/**
 * Convert a working directory path to the sanitized directory name used by
 * the droid CLI for project-specific session storage.
 *
 * Mirrors the CLI's `sanitizePathToDirectoryName` helper.
 *
 * @internal Exported primarily for testing — typical callers should use
 *   {@link listSessions} with the `cwd` option instead.
 */
export function sanitizePathToDirectoryName(cwd: string): string {
  let expandedPath = cwd;
  if (cwd.startsWith('~/') || cwd === '~') {
    expandedPath = path.join(os.homedir(), cwd.slice(1));
  }

  const absolutePath = path.resolve(expandedPath);
  let canonicalPath = absolutePath;
  try {
    canonicalPath = fs.realpathSync(absolutePath);
  } catch {
    canonicalPath = absolutePath;
  }
  const normalized = canonicalPath.replace(/[\\/]+$/, '');

  if (process.platform === 'win32') {
    return `-${normalized.replace(/^([A-Z]):/i, '$1').replace(/[\\/]+/g, '-')}`;
  }
  return `-${normalized.replace(/^\/+/, '').replace(/\/+/g, '-')}`;
}

/**
 * Resolve the default sessions root directory.
 *
 * @internal Exported primarily for testing — typical callers should use
 *   {@link listSessions} without a `sessionsDir` option instead.
 */
export function getDefaultSessionsDir(): string {
  return path.join(os.homedir(), '.factory', 'sessions');
}

/**
 * List droid sessions stored on disk.
 *
 * Sessions are read from `~/.factory/sessions/` (or the `sessionsDir`
 * override) by scanning `.jsonl` files, mirroring the logic used by the
 * `droid` CLI's `SessionService`. No JSON-RPC server calls are made.
 *
 * By default, returns sessions for `process.cwd()`. Pass a specific `cwd`
 * to scope to a different project, or `fetchOutsideCWD: true` to return
 * every session on disk regardless of working directory. Results are
 * sorted by `modifiedTime` descending and can be capped with `numSessions`.
 *
 * @example
 * ```ts
 * // Sessions for the current project
 * const sessions = await listSessions();
 *
 * // 10 most recent sessions across every project
 * const recent = await listSessions({
 *   fetchOutsideCWD: true,
 *   numSessions: 10,
 * });
 * ```
 */
export async function listSessions(
  options: ListSessionsOptions = {}
): Promise<SessionMetadata[]> {
  if (options.apiKey) {
    const result = await listRemoteSessions({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      computerId: options.computerId,
      limit: options.numSessions,
      cursor: options.cursor,
    });
    return result.sessions.map((s) => ({
      id: s.sessionId,
      title: s.title ?? '',
      messageCount: s.messageCount,
      modifiedTime: new Date(s.updatedAt),
      createdTime: new Date(s.createdAt),
      owner: '',
    }));
  }

  const sessionsDir = options.sessionsDir ?? getDefaultSessionsDir();
  const favorites = loadFavorites(sessionsDir);

  const rootEntries = readDirEntries(sessionsDir);

  // Legacy-global candidates (pre-subdir sessions) always live directly
  // under sessionsDir; collect them regardless of mode. Project-specific
  // candidates come from either one subdir (single-project mode) or all
  // of them (fetchOutsideCWD mode).
  const legacyCandidates = collectCandidates(sessionsDir, rootEntries);
  const projectCandidates: SessionCandidate[] = [];

  let requiredCwd: string | undefined;

  if (options.fetchOutsideCWD) {
    for (const entry of rootEntries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('-')) continue;
      const dir = path.join(sessionsDir, entry.name);
      projectCandidates.push(...collectCandidates(dir, readDirEntries(dir)));
    }
  } else {
    const normalizedCwd = path.resolve(options.cwd ?? process.cwd());
    requiredCwd = normalizedCwd;
    const projectDir = path.join(
      sessionsDir,
      sanitizePathToDirectoryName(normalizedCwd)
    );
    projectCandidates.push(
      ...collectCandidates(projectDir, readDirEntries(projectDir))
    );
  }

  // Sort candidates mtime-descending so the first parses hit the newest
  // sessions — required for `numSessions` to skip the tail.
  const byMtimeDesc = (a: SessionCandidate, b: SessionCandidate): number =>
    b.stats.mtime.getTime() - a.stats.mtime.getTime();
  projectCandidates.sort(byMtimeDesc);
  legacyCandidates.sort(byMtimeDesc);

  // When numSessions is set, parse only as many files as we need (with a
  // small oversample to cover parse failures / archived / cwd-mismatch).
  const parseLimit =
    options.numSessions !== undefined && options.numSessions >= 0
      ? options.numSessions + PARSE_OVERSAMPLE
      : undefined;

  const ctx: ParseContext = { favorites };
  const legacyCtx: ParseContext =
    requiredCwd !== undefined ? { favorites, requiredCwd } : ctx;

  const projectSessions = parseUpTo(projectCandidates, ctx, parseLimit);
  const legacySessions = parseUpTo(legacyCandidates, legacyCtx, parseLimit);

  // Dedupe by id (migration edge case where the same session appears in
  // both a legacy global file and a project subdir).
  const byId = new Map<string, SessionMetadata>();
  for (const session of [...projectSessions, ...legacySessions]) {
    const existing = byId.get(session.id);
    if (
      !existing ||
      session.modifiedTime.getTime() > existing.modifiedTime.getTime()
    ) {
      byId.set(session.id, session);
    }
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime()
  );

  if (options.numSessions !== undefined && options.numSessions >= 0) {
    return sorted.slice(0, options.numSessions);
  }

  return sorted;
}
