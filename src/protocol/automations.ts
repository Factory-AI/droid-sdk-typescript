import { z } from 'zod';

import { AutomationPrivacyLevel } from './automations-enums.js';

export const AutomationCreatedBySchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export type AutomationCreatedBy = z.infer<typeof AutomationCreatedBySchema>;

/**
 * Schema for the on-disk YAML metadata in HEARTBEAT.md frontmatter.
 *
 * This is the flat representation stored between `---` delimiters.
 * Differs from AutomationConfig in that `schedule` is a plain string
 * (e.g. "daily", "0 9 * * 1-5") rather than the runtime
 * `{ cadence: string }` shape.
 */
export const AutomationsHeartbeatSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().optional(),
  schedule: z.string(),
  model: z.string().optional(),
  tags: z.array(z.string()).optional(),
  paused: z.boolean().optional(),
  privacyLevel: z.nativeEnum(AutomationPrivacyLevel).optional(),
  createdBy: AutomationCreatedBySchema.optional(),
  forkedFrom: z.string().optional(),
});

export type AutomationsHeartbeat = z.infer<typeof AutomationsHeartbeatSchema>;
