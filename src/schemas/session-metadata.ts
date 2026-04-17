import { z } from 'zod';

import { SessionTagSchema } from './client.js';
import { DecompSessionType } from './enums.js';

/**
 * Session metadata returned by {@link listSessions}.
 *
 * Mirrors the shape used by the `droid` CLI's `SessionService` so results
 * are interoperable with sessions created by the CLI or the SDK.
 */
export const SessionMetadataSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    sessionTitle: z.string().optional(),
    owner: z.string(),
    messageCount: z.number(),
    modifiedTime: z.date(),
    createdTime: z.date(),
    isFavorite: z.boolean().optional(),
    cwd: z.string().optional(),
    decompSessionType: z.nativeEnum(DecompSessionType).optional(),
    decompMissionId: z.string().optional(),
  })
  .passthrough();

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * First line of a droid session `.jsonl` file. Produced by the CLI's
 * `SessionService` when a session is created.
 * @internal
 */
export const SessionStartEventSchema = z
  .object({
    type: z.literal('session_start'),
    sessionId: z.string().optional(),
    title: z.string().optional(),
    sessionTitle: z.string().optional(),
    owner: z.string().optional(),
    cwd: z.string().optional(),
    decompSessionType: z
      .nativeEnum(DecompSessionType)
      .optional()
      .catch(undefined),
    decompMissionId: z.string().optional(),
  })
  .passthrough();

export type SessionStartEvent = z.infer<typeof SessionStartEventSchema>;

/**
 * Content of the sibling `<sessionId>.settings.json` file, if present.
 * Used to detect archived sessions and recover tag metadata.
 * @internal
 */
export const SessionSettingsFileSchema = z
  .object({
    archivedAt: z.string().optional(),
    tags: z.array(SessionTagSchema).optional(),
  })
  .passthrough();

export type SessionSettingsFile = z.infer<typeof SessionSettingsFileSchema>;

/** Options accepted by {@link listSessions}. */
export interface ListSessionsOptions {
  /**
   * Working directory to scope the listing to. Defaults to `process.cwd()`.
   * Ignored when `fetchOutsideCWD` is `true`.
   */
  cwd?: string;

  /**
   * If `true`, return sessions from every working directory on disk and
   * ignore `cwd`. Defaults to `false` (only sessions for the given `cwd`
   * are returned).
   */
  fetchOutsideCWD?: boolean;

  /**
   * Cap the number of sessions returned. Results are sorted by
   * `modifiedTime` descending before being truncated.
   */
  numSessions?: number;

  /**
   * Override the sessions root directory. Defaults to `~/.factory/sessions/`.
   * Primarily useful for tests and custom installations.
   */
  sessionsDir?: string;
}
