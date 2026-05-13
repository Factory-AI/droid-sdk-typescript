import {
  createSession,
  type CreateSessionOptions,
  type DroidResult,
  type MessageOptions,
} from './session.js';
import { DroidMessageType } from './stream.js';

export interface RunOptions extends CreateSessionOptions, MessageOptions {}

export async function run(
  prompt: string,
  options: RunOptions = {}
): Promise<DroidResult> {
  const session = await createSession(options);

  try {
    for await (const msg of session.stream(prompt, {
      ...options,
      includePartialMessages: false,
    })) {
      if (msg.type === DroidMessageType.Result) {
        return msg;
      }
    }

    throw new Error('Stream completed without a result message');
  } finally {
    await session.close();
  }
}
