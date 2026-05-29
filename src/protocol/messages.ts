// Source-of-truth mirror of factory-mono-alpha message content-block schemas.
// Faithful copy of the content-block stack from
//   packages/common/src/sessionV2/messages/schemas.ts
// EXCLUDING FactoryDroidMessageSchema / FactoryDroidMessageWithCachingSchema,
// which are deferred to a later (TIER-2) migration step.

import { z } from 'zod';

import {
  DocumentSourceType,
  MessageContentBlockType,
  ModelProvider,
} from './enums.js';

// Base content block with optional id field
export const BaseContentBlockSchema = z.object({
  id: z.string().optional(),
});

// Text block
export const TextBlockSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.Text),
  text: z.string(),
});

// Image source and block
export const Base64ImageSourceSchema = z.object({
  type: z.literal('base64'),
  data: z.string(),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
});

export const ImageBlockSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.Image),
  source: Base64ImageSourceSchema,
});

// Thinking blocks
export const ThinkingBlockSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.Thinking),
  signature: z.string(), // required but can be empty string for Gemini
  signatureProvider: z
    .union([z.nativeEnum(ModelProvider), z.literal('unknown')])
    .optional(),
  thinking: z.string(),
  durationMs: z.number().nonnegative().optional(),
});

export const RedactedThinkingBlockSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.RedactedThinking),
  data: z.string(),
});

// Tool use block (id is required, not optional)
export const ToolUseSchema = z.object({
  type: z.literal(MessageContentBlockType.ToolUse),
  id: z.string(),
  input: z.record(z.unknown()),
  name: z.string(),
  thoughtSignature: z.string().optional(), // Gemini thought signature
});

// For now, this will be only used to send initial file content from the frontend to the daemon.
// In the future, when we switch off vercel, we'll be able to use this instead of parsedData.
export const Base64PDFSourceSchema = z.object({
  type: z.literal(DocumentSourceType.Base64),
  mediaType: z.literal('application/pdf'),
  data: z.string(),
  parsedData: z.string().optional(),
  name: z.string().optional(),
  path: z.string().optional(),
});

export const PlainTextSourceSchema = z.object({
  type: z.literal(DocumentSourceType.Text),
  mediaType: z.literal('text/plain'),
  data: z.string(),
  name: z.string().optional(),
  mime: z.string().optional(),
});

export const DocumentSourceSchema = z.union([
  Base64PDFSourceSchema,
  PlainTextSourceSchema,
]);

export const DocumentBlockSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.Document),
  source: DocumentSourceSchema,
});

// Tool result block
export const ToolResultSchema = BaseContentBlockSchema.extend({
  type: z.literal(MessageContentBlockType.ToolResult),
  toolUseId: z.string(),
  content: z
    .union([
      z.string(),
      z.array(
        z.union([TextBlockSchema, ImageBlockSchema, DocumentBlockSchema])
      ),
    ])
    .optional(),
  isError: z.boolean().optional(),
});

// Content block discriminated union
export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
  ToolUseSchema,
  ToolResultSchema,
  DocumentBlockSchema,
]);

// Cache label for caching support
export const CacheLabelSchema = z.object({
  cache_control: z
    .object({
      type: z.literal('ephemeral'),
    })
    .optional(),
});

export type TextBlock = z.infer<typeof TextBlockSchema>;
export type Base64ImageSource = z.infer<typeof Base64ImageSourceSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;
export type RedactedThinkingBlock = z.infer<typeof RedactedThinkingBlockSchema>;
export type ToolUse = z.infer<typeof ToolUseSchema>;
export type Base64PDFSource = z.infer<typeof Base64PDFSourceSchema>;
export type PlainTextSource = z.infer<typeof PlainTextSourceSchema>;
export type DocumentSource = z.infer<typeof DocumentSourceSchema>;
export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type CacheLabel = z.infer<typeof CacheLabelSchema>;
