import { isDirectRun } from './_harness.js';
import { main as cancelInterrupt } from './cancel-interrupt.js';
import { main as defaultStreaming } from './default-streaming.js';
import { main as defaultVsPartialConsistency } from './default-vs-partial-consistency.js';
import { main as errorPaths } from './error-paths.js';
import { main as multiTurn } from './multi-turn.js';
import { main as partialStreaming } from './partial-streaming.js';
import { main as structuredOutput } from './structured-output.js';
import { main as toolUse } from './tool-use.js';

const scripts = [
  ['default-streaming', defaultStreaming],
  ['partial-streaming', partialStreaming],
  ['default-vs-partial-consistency', defaultVsPartialConsistency],
  ['structured-output', structuredOutput],
  ['tool-use', toolUse],
  ['multi-turn', multiTurn],
  ['cancel-interrupt', cancelInterrupt],
  ['error-paths', errorPaths],
] as const;

export async function main(): Promise<void> {
  console.log(
    [
      'Droid SDK stress suite',
      `DROID_EXEC_PATH=${process.env['DROID_EXEC_PATH'] ?? 'droid-dev'}`,
      `DROID_STRESS_MODEL=${process.env['DROID_STRESS_MODEL'] ?? '(default)'}`,
      `DROID_STRESS_REPEAT=${process.env['DROID_STRESS_REPEAT'] ?? '1'}`,
      `DROID_STRESS_ARTIFACTS=${
        process.env['DROID_STRESS_ARTIFACTS'] ?? '.stress-artifacts'
      }`,
    ].join('\n')
  );

  for (const [name, script] of scripts) {
    console.log(`\n## ${name}`);
    await script();
  }

  console.log('\nAll stress scripts completed.');
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
