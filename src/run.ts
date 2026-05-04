import {
  createSession,
  type CreateSessionOptions,
  type DroidResult,
  type MessageOptions,
} from './session.js';

export interface RunOptions extends CreateSessionOptions, MessageOptions {}

export async function run(
  text: string,
  options: RunOptions = {}
): Promise<DroidResult> {
  const session = await createSession(options);

  try {
    return await session.send(text, options);
  } finally {
    await session.close();
  }
}
