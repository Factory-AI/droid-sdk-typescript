//
// `TokenUsage` is exported from `./session.js`; not re-exported here to avoid
// duplicate symbols on the public protocol barrel. Import from `./session.js`
// (or via the barrel).

import { z } from 'zod';

import {
  EffectiveFactoryRouterModelSchema,
  SessionSettingsSchema,
} from './session-settings-schema.js';

export type EffectiveFactoryRouterModel = z.infer<
  typeof EffectiveFactoryRouterModelSchema
>;

/**
 * Settings persisted to .settings.json for each session.
 * Note: Field names differ from protocol (model vs modelId).
 */
export type SessionSettings = z.infer<typeof SessionSettingsSchema>;
