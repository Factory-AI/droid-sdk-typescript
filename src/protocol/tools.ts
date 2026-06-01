import { z } from 'zod';

import { RiskLevel } from './tools-enums.js';

// ============================================================
// Common Tool Input Schemas
// These schemas define the input parameters for tools and are
// shared between droid-core (execution) and component-library (rendering)
// ============================================================

/**
 * Edit tool input (Anthropic-style find/replace)
 */
export const EditToolInputSchema = z.object({
  file_path: z.string(),
  old_str: z.string(),
  new_str: z.string(),
  change_all: z.boolean().optional(),
});

/**
 * Create tool input
 */
export const CreateToolInputSchema = z.object({
  file_path: z.string(),
  content: z.string(),
});

/**
 * Read tool input
 */
export const ReadToolInputSchema = z.object({
  file_path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  image_quality: z.enum(['default', 'high']).optional(),
});

/**
 * Execute tool input
 */
export const ExecuteToolInputSchema = z.object({
  summary: z.string().optional(),
  command: z.string(),
  timeout: z.number().optional(),
  riskLevel: z.nativeEnum(RiskLevel).optional(),
  riskLevelReason: z.string().optional(),
  fireAndForget: z.boolean().optional(),
});

/**
 * Glob tool input
 */
export const GlobToolInputSchema = z.object({
  patterns: z.array(z.string()).optional(),
  folder: z.string().optional(),
  excludePatterns: z.array(z.string()).optional(),
});

/**
 * Grep tool input
 */
export const GrepToolInputSchema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob_pattern: z.string().optional(),
  case_insensitive: z.boolean().optional(),
  output_mode: z.enum(['file_paths', 'content']).optional(),
  context: z.number().optional(),
  context_before: z.number().optional(),
  context_after: z.number().optional(),
  line_numbers: z.boolean().optional(),
  head_limit: z.number().optional(),
});

/**
 * LS tool input
 */
export const LSToolInputSchema = z.object({
  directory_path: z.string().optional(),
  ignorePatterns: z.array(z.string()).optional(),
});

/**
 * WebSearch tool input
 */
export const WebSearchToolInputSchema = z.object({
  query: z.string(),
  numResults: z.number().optional(),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  category: z.string().optional(),
});

/**
 * FetchUrl tool input
 */
export const FetchUrlToolInputSchema = z.object({
  url: z.string(),
});

/**
 * Task (subagent) tool input
 */
export const TaskToolInputSchema = z.object({
  subagent_type: z
    .string()
    .describe(
      'The custom droid name/identifier to run (must match an available droid; do not guess)'
    ),
  description: z
    .string()
    .describe('A short (3-5 word) description of the task (used in UI)'),
  prompt: z
    .string()
    .describe('The full task prompt for the subagent to execute'),
});

/**
 * TodoWrite tool input
 */
export const TodoWriteToolInputSchema = z.object({
  todos: z.string(),
});

/**
 * ExitSpecMode tool input
 */
export const ExitSpecModeToolInputSchema = z.object({
  plan: z.string(),
  title: z.string().optional(),
});

/**
 * Skill tool input
 */
export const SkillToolInputSchema = z.object({
  skill: z.string(),
});

/**
 * ApplyPatch tool input
 */
export const ApplyPatchToolInputSchema = z.object({
  file_path: z.string(),
  patch: z.string(),
});

/**
 * ProposeMission tool input
 */
export const ProposeMissionToolInputSchema = z.object({
  proposal: z.string(),
  title: z.string().optional(),
});

// ============================================================
// Common Tool Result Schemas
// These define the shape of data returned by tools
// ============================================================

/**
 * Diff line for Edit/Create tool results
 */
export const DiffLineSchema = z.object({
  type: z.enum(['added', 'removed', 'unchanged', 'context']),
  content: z.string(),
  lineNumber: z
    .object({
      old: z.number().optional(),
      new: z.number().optional(),
    })
    .optional(),
});

/**
 * Common result payload for file operation tools (Edit, Create, ApplyPatch)
 */
export const FileOperationResultSchema = z.object({
  success: z.boolean().optional(),
  diff: z.string().optional(),
  diffLines: z.array(DiffLineSchema).optional(),
  content: z.string().optional(),
  message: z.string().optional(),
  file_path: z.string().optional(),
  filePath: z.string().optional(),
});
