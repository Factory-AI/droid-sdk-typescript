import { z } from 'zod';

import { ModelID } from './enums.js';

/**
 * A lenient model ID array that silently drops unrecognized values instead of
 * failing validation. This ensures backward compatibility when ModelID enum
 * values are removed (e.g. after EAP model cleanup) — any Firestore documents
 * still referencing old IDs will have them filtered out rather than causing
 * the entire security policy to fail parsing.
 */
const modelIdValues: ReadonlySet<string> = new Set(Object.values(ModelID));
const tolerantModelIdArray = z
  .array(z.string())
  .transform((ids) => ids.filter((id): id is ModelID => modelIdValues.has(id)));

export const UserModelPolicySchema = z.object({
  allowedModelIds: tolerantModelIdArray,
  blockedModelIds: tolerantModelIdArray,
});
