import {
  createSession,
  type CreateSessionOptions,
  type DroidResult,
  type MessageOptions,
} from './session.js';

export interface RunOptions extends CreateSessionOptions, MessageOptions {}

export async function run(
  prompt: string,
  options: RunOptions = {}
): Promise<DroidResult> {
  const session = await createSession(options);

  try {
    const turn = await session.send(prompt, options);
    return await turn.result();
  } finally {
    await session.close();
  }
}
