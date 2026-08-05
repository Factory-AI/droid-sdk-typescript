/**
 * AskUser elicitation example.
 *
 * When Droid needs input mid-turn it sends an `askUser` request. `askUserHandler`
 * answers it programmatically; without a handler the request goes unanswered.
 *
 * Usage:
 *   npx tsx examples/node/ask-user-elicitation.ts
 */

import { run } from '@factory/droid-sdk/node';

const { text } = await run(
  'Use the AskUser tool to ask me which color I prefer, then reply with the color I picked.',
  {
    askUserHandler(params) {
      for (const question of params.questions) {
        console.log(`[asked] ${question.question}`);
        console.log(`[options] ${question.options.join(', ')}`);
      }

      // Answer every question with its first option. A real integration would
      // prompt the user; returning `cancelled: true` declines instead.
      return {
        answers: params.questions.map((question) => ({
          index: question.index,
          question: question.question,
          answer: question.options[0] ?? 'no preference',
        })),
      };
    },
  }
);

console.log(`\n${text}`);
