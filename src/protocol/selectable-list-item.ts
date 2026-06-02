import { z } from 'zod';

import { ToolConfirmationOutcome } from './enums.js';

/**
 * Schema for a selectable list item in CLI UI
 *
 * Used for tool confirmation prompts to provide structured options
 * that can be rendered with visual feedback (colors, prefixes, etc.)
 */
export const ToolConfirmationListItemSchema = z.object({
  label: z.string(),
  value: z.nativeEnum(ToolConfirmationOutcome),
});

export type ToolConfirmationListItem = z.infer<
  typeof ToolConfirmationListItemSchema
>;
