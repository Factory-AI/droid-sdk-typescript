/**
 * AskUser elicitation example.
 *
 * When Droid needs input mid-turn, `askUserHandler` answers it. Without a
 * handler, the request is declined.
 *
 * Usage:
 *   npx tsx examples/node/ask-user-elicitation.ts
 */

import { run } from '@factory/droid-sdk/node';

const result = await run(
  'Use the AskUser tool to ask me which color I prefer, then reply with the color I picked.',
  {
    askUserHandler({ questions }) {
      for (const question of questions) {
        console.log(`[asked] ${question.question}`);
        console.log(`[options] ${question.options.join(', ')}`);
      }

      // Answer every question with its first option. A real integration would
      // prompt the user; returning `cancelled: true` declines instead.
      return {
        answers: questions.map((question) => ({
          index: question.index,
          question: question.question,
          answer: question.options[0] ?? 'no preference',
        })),
      };
    },
  }
);

if (!result.success) {
  throw new Error(result.error?.message ?? 'The turn was interrupted.');
}

console.log(`\n${result.text}`);
