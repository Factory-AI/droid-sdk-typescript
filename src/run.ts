import {
  aggregateMessages,
  createSession,
  type CreateSessionOptions,
  type DroidResult,
  type MessageOptions,
} from './session.js';
import type { DroidMessage } from './stream.js';

export interface RunOptions extends CreateSessionOptions, MessageOptions {}

export async function run(
  prompt: string,
  options: RunOptions = {}
): Promise<DroidResult> {
  const session = await createSession(options);

  try {
    const startedAt = Date.now();
    const messages: DroidMessage[] = [];
    for await (const msg of session.stream(prompt, options)) {
      messages.push(msg);
    }
    return aggregateMessages(session.sessionId, messages, startedAt, options);
  } finally {
    await session.close();
  }
}
