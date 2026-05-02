import {
  createSession,
  type CreateSessionOptions,
  type DroidResult,
  type MessageOptions,
} from './session.js';

export interface PromptOptions extends CreateSessionOptions, MessageOptions {}

export async function prompt(
  text: string,
  options: PromptOptions = {}
): Promise<DroidResult> {
  const session = await createSession(options);

  try {
    return await session.send(text, options);
  } finally {
    await session.close();
  }
}
