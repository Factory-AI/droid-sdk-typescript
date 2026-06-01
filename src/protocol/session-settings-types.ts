// Mirror of packages/common/src/session/settings/types.ts.
//
// The upstream file re-exports `TokenUsage` from its local schema. In this
// SDK the same `TokenUsageSchema` (same shape, mirrored from the same
// upstream definition) lives in `./session.js` and is already exported as
// `TokenUsage` from there. Re-exporting `TokenUsage` here would cause a
// duplicate symbol via the public protocol barrel, so it is intentionally
// omitted from this file — consumers should import `TokenUsage` from
// `./session.js` (or via the barrel).

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
