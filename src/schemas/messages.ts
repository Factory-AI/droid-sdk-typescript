import { z } from 'zod';


/** Text content block. */
export const TextBlockSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    id: z.string().optional(),
  })
  .passthrough();

export type TextBlock = z.infer<typeof TextBlockSchema>;

/** Base64-encoded image source. */
export const Base64ImageSourceSchema = z
  .object({
    type: z.literal('base64'),
    data: z.string(),
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  })
  .passthrough();

export type Base64ImageSource = z.infer<typeof Base64ImageSourceSchema>;

/** Image content block. */
export const ImageBlockSchema = z
  .object({
    type: z.literal('image'),
    source: Base64ImageSourceSchema,
    id: z.string().optional(),
  })
  .passthrough();

export type ImageBlock = z.infer<typeof ImageBlockSchema>;

/** Thinking content block. */
export const ThinkingBlockSchema = z
  .object({
    type: z.literal('thinking'),
    signature: z.string(),
    thinking: z.string(),
    id: z.string().optional(),
    signatureProvider: z.string().optional(),
  })
  .passthrough();

export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;

/** Redacted thinking content block. */
export const RedactedThinkingBlockSchema = z
  .object({
    type: z.literal('redacted_thinking'),
    data: z.string(),
    id: z.string().optional(),
  })
  .passthrough();

export type RedactedThinkingBlock = z.infer<typeof RedactedThinkingBlockSchema>;

/** Tool use content block. */
export const ToolUseBlockSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string(),
    input: z.record(z.unknown()),
    name: z.string(),
    thoughtSignature: z.string().optional(),
  })
  .passthrough();

export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

/** Tool result content block. */
export const ToolResultBlockSchema = z
  .object({
    type: z.literal('tool_result'),
    toolUseId: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    isError: z.boolean().optional(),
    id: z.string().optional(),
  })
  .passthrough();

export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>;

/** Document content block. */
export const DocumentBlockSchema = z
  .object({
    type: z.literal('document'),
    source: z.record(z.unknown()),
    id: z.string().optional(),
  })
  .passthrough();

export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;

/** Discriminated union over all content block types. */
export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
  DocumentBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;


/** Factory Droid message schema (used in CreateMessageNotification and session data). */
export const FactoryDroidMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'tool', 'system']),
    content: z.array(ContentBlockSchema),
    createdAt: z.number(),
    updatedAt: z.number(),
    parentId: z.string().optional(),
    visibility: z.enum(['both', 'llm_only', 'user_only']).optional(),
    isError: z.boolean().optional(),
  })
  .passthrough();

export type FactoryDroidMessage = z.infer<typeof FactoryDroidMessageSchema>;

/** Document source for user messages (PDF or plain text). */
export const DocumentSourceSchema = z
  .object({
    type: z.string(),
    mediaType: z.string(),
    data: z.string(),
    name: z.string().optional(),
    mime: z.string().optional(),
  })
  .passthrough();

export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
