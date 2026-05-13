import { OutputFormatType, run } from '@factory/droid-sdk';

type FavoriteNumber = { favoriteNumber: number };

const result = await run('Pick a favorite number between 1 and 42.', {
  cwd: process.cwd(),
  outputFormat: {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: {
        favoriteNumber: {
          type: 'number',
          minimum: 1,
          maximum: 42,
        },
      },
      required: ['favoriteNumber'],
    },
  },
});

console.log(
  (result.structuredOutput as FavoriteNumber | undefined)?.favoriteNumber
);
