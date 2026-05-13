import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DroidMessageType,
  createSession,
  run,
  type CreateSessionOptions,
  type DroidResult,
  type DroidSession,
  type DroidStreamEvent,
  type MessageOptions,
  type RunOptions,
} from '@factory/droid-sdk';

export interface CollectedStream {
  name: string;
  events: DroidStreamEvent[];
  counts: Record<string, number>;
  result: DroidResult;
}

export const DEFAULT_PUBLIC_TYPES = new Set<string>([
  DroidMessageType.Assistant,
  DroidMessageType.User,
  DroidMessageType.ToolCall,
  DroidMessageType.ToolResult,
  DroidMessageType.Error,
  DroidMessageType.Result,
]);

export const PARTIAL_ONLY_TYPES = new Set<string>([
  DroidMessageType.AssistantTextDelta,
  DroidMessageType.AssistantTextComplete,
  DroidMessageType.ThinkingTextDelta,
  DroidMessageType.ThinkingTextComplete,
  DroidMessageType.ToolCallDelta,
  DroidMessageType.ToolProgress,
]);

export const INTERNAL_TYPES = new Set<string>([
  'create_message',
  'structured_output',
  'tool_use',
]);

export function stressExecPath(): string {
  return process.env['DROID_EXEC_PATH'] ?? 'droid-dev';
}

export function stressModelOptions(): Pick<CreateSessionOptions, 'modelId'> {
  const modelId = process.env['DROID_STRESS_MODEL'];
  return modelId ? { modelId } : {};
}

export function stressRepeat(): number {
  const parsed = Number.parseInt(process.env['DROID_STRESS_REPEAT'] ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function createStressSession(
  options: CreateSessionOptions = {}
): Promise<DroidSession> {
  return createSession({
    execPath: stressExecPath(),
    cwd: process.cwd(),
    ...stressModelOptions(),
    ...options,
  });
}

export function createStressRunOptions(options: RunOptions = {}): RunOptions {
  return {
    execPath: stressExecPath(),
    cwd: process.cwd(),
    ...stressModelOptions(),
    ...options,
  };
}

export async function runStress(
  prompt: string,
  options: RunOptions = {}
): Promise<DroidResult> {
  const result = await run(prompt, createStressRunOptions(options));
  validateResult(result, 'run()');
  await writeJsonlArtifact('run', [result]);
  return result;
}

export async function collectStream(
  name: string,
  session: DroidSession,
  prompt: string,
  options: MessageOptions = {}
): Promise<CollectedStream> {
  return collect(name, session, prompt, {
    ...options,
    includePartialMessages: false,
  });
}

export async function collectPartialStream(
  name: string,
  session: DroidSession,
  prompt: string,
  options: MessageOptions = {}
): Promise<CollectedStream> {
  return collect(name, session, prompt, {
    ...options,
    includePartialMessages: true,
  });
}

export function countByType(
  events: DroidStreamEvent[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }
  return counts;
}

export function resultEvents(events: DroidStreamEvent[]): DroidResult[] {
  return events.filter(
    (event): event is DroidResult => event.type === DroidMessageType.Result
  );
}

export function lastResult(events: DroidStreamEvent[]): DroidResult {
  const results = resultEvents(events);
  assert.equal(
    results.length,
    1,
    `expected exactly one result, saw ${results.length}\n${diagnose(events)}`
  );
  assert.equal(
    events.at(-1)?.type,
    DroidMessageType.Result,
    `result must be final event\n${diagnose(events)}`
  );
  return results[0]!;
}

export function validateResult(result: DroidResult, label: string): void {
  assert.equal(result.type, DroidMessageType.Result, `${label}: not a result`);
  assert.equal(
    result.result,
    result.text,
    `${label}: result.result and result.text diverged`
  );
  assert.ok(Array.isArray(result.messages), `${label}: messages missing`);
  assertNoInternalMessages(result.messages, `${label}: result.messages`);

  if (!result.isError) {
    assert.equal(result.error, null, `${label}: success result has error`);
    assert.equal(
      result.structuredOutputError ?? null,
      null,
      `${label}: success result has structuredOutputError`
    );
  }
}

export function assertDefaultStreamShape(
  collected: CollectedStream,
  label = collected.name
): void {
  for (const event of collected.events) {
    assert.ok(
      DEFAULT_PUBLIC_TYPES.has(event.type),
      `${label}: default stream leaked ${event.type}\n${diagnose(
        collected.events
      )}`
    );
  }
  assertNoInternalMessages(collected.events, label);
  validateResult(collected.result, label);
}

export function assertPartialStreamShape(
  collected: CollectedStream,
  label = collected.name
): void {
  assertNoInternalMessages(collected.events, label);
  validateResult(collected.result, label);
}

export function assertNoInternalMessages(
  events: DroidStreamEvent[],
  label: string
): void {
  const leaked = events.filter((event) => INTERNAL_TYPES.has(event.type));
  assert.equal(
    leaked.length,
    0,
    `${label}: internal message types leaked: ${leaked
      .map((event) => event.type)
      .join(', ')}`
  );
}

export function assertAssistantOutput(
  collected: CollectedStream,
  label = collected.name
): void {
  const assistantText = assistantTexts(collected.events).join('');
  assert.ok(
    assistantText.length > 0 || collected.result.result.length > 0,
    `${label}: expected non-empty assistant output\n${diagnose(
      collected.events
    )}`
  );
}

export function assertPartialTextConsistency(
  collected: CollectedStream,
  label = collected.name
): void {
  const deltas = assistantTextDeltas(collected.events);
  const assistantText = assistantTexts(collected.events).join('');
  const resultText = collected.result.result;

  if (deltas.length > 0 && assistantText.length > 0) {
    assertTextCompatible(
      deltas,
      assistantText,
      `${label}: assistant deltas contradict full assistant message`
    );
  }

  if (assistantText.length > 0 && resultText.length > 0) {
    assertTextCompatible(
      assistantText,
      resultText,
      `${label}: full assistant text contradicts result text`
    );
  }

  if (deltas.length > 0 && resultText.length > 0) {
    assertTextCompatible(
      deltas,
      resultText,
      `${label}: assistant deltas contradict result text`
    );
  }
}

export function assertToolPairing(
  events: DroidStreamEvent[],
  label: string
): void {
  const calls = new Set(
    events
      .filter((event) => event.type === DroidMessageType.ToolCall)
      .map((event) => event.toolUse.id)
  );
  const results = events.filter(
    (event) => event.type === DroidMessageType.ToolResult
  );

  for (const result of results) {
    assert.ok(
      calls.has(result.toolUseId),
      `${label}: tool_result ${result.toolUseId} has no prior tool_call`
    );
  }
}

export async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = `/tmp/droid-sdk-stress-${prefix}-${process.pid}-${Date.now()}`;
  await mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    if (process.env['DROID_STRESS_KEEP_TEMP'] !== '1') {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export async function runStressCase(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const repeat = stressRepeat();
  for (let index = 0; index < repeat; index++) {
    const suffix = repeat > 1 ? ` (${index + 1}/${repeat})` : '';
    console.log(`→ ${name}${suffix}`);
    await fn();
    console.log(`✓ ${name}${suffix}`);
  }
}

export function assistantTextDeltas(events: DroidStreamEvent[]): string {
  return events
    .filter((event) => event.type === DroidMessageType.AssistantTextDelta)
    .map((event) => event.text)
    .join('');
}

export function assistantTexts(events: DroidStreamEvent[]): string[] {
  return events
    .filter((event) => event.type === DroidMessageType.Assistant)
    .map((event) => event.text)
    .filter(Boolean);
}

export function diagnose(events: DroidStreamEvent[]): string {
  return JSON.stringify(
    events.map((event, index) => summarizeEvent(event, index)),
    null,
    2
  );
}

export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? metaUrl === pathToFileURL(entry).href : false;
}

export async function writeJsonlArtifact(
  name: string,
  events: DroidStreamEvent[]
): Promise<void> {
  const root = process.env['DROID_STRESS_ARTIFACTS'] ?? '.stress-artifacts';
  await mkdir(root, { recursive: true });
  const file = join(
    root,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitize(name)}.jsonl`
  );
  const lines = events
    .map((event, index) => JSON.stringify(summarizeEvent(event, index)))
    .join('\n');
  await writeFile(file, `${lines}\n`);
}

async function collect(
  name: string,
  session: DroidSession,
  prompt: string,
  options: MessageOptions
): Promise<CollectedStream> {
  const events: DroidStreamEvent[] = [];
  if (options.includePartialMessages === true) {
    for await (const event of session.stream(prompt, {
      ...options,
      includePartialMessages: true,
    })) {
      events.push(event);
    }
  } else {
    for await (const event of session.stream(prompt, {
      ...options,
      includePartialMessages: false,
    })) {
      events.push(event);
    }
  }
  const result = lastResult(events);
  const collected = {
    name,
    events,
    counts: countByType(events),
    result,
  };
  validateResult(result, name);
  await writeJsonlArtifact(name, events);
  return collected;
}

function assertTextCompatible(
  left: string,
  right: string,
  message: string
): void {
  const a = normalizeText(left);
  const b = normalizeText(right);
  assert.ok(
    a === b || a.includes(b) || b.includes(a),
    `${message}\nleft: ${left}\nright: ${right}`
  );
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '');
}

function summarizeEvent(
  event: DroidStreamEvent,
  index: number
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    index,
    type: event.type,
  };

  switch (event.type) {
    case DroidMessageType.Assistant:
      return {
        ...base,
        textLength: event.text.length,
        textPreview: event.text.slice(0, 160),
      };
    case DroidMessageType.AssistantTextDelta:
    case DroidMessageType.ThinkingTextDelta:
      return {
        ...base,
        messageId: event.messageId,
        blockIndex: event.blockIndex,
        textLength: event.text.length,
        textPreview: event.text.slice(0, 160),
      };
    case DroidMessageType.ToolCall:
    case DroidMessageType.ToolCallDelta:
      return {
        ...base,
        toolUseId: event.toolUse.id,
        toolName: event.toolUse.name,
      };
    case DroidMessageType.ToolResult:
      return {
        ...base,
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        isError: event.isError,
      };
    case DroidMessageType.Error:
      return {
        ...base,
        message: event.message,
        errorType: event.errorType,
      };
    case DroidMessageType.Result:
      return {
        ...base,
        subtype: event.subtype,
        isError: event.isError,
        resultLength: event.result.length,
        messageCount: event.messages.length,
        structuredOutput: event.structuredOutput ?? null,
        structuredOutputError: event.structuredOutputError ?? null,
      };
    default:
      return base;
  }
}
