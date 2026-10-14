/**
 * Skills example.
 *
 * Lists the skills available to a Node session.
 *
 * Usage:
 *   npx tsx examples/node/skills.ts
 */

import { createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  const { skills } = await session.listSkills();

  for (const skill of skills) {
    console.log(
      `${skill.name}: ${skill.enabled === false ? 'disabled' : 'enabled'}`
    );
  }
} finally {
  await session.close();
}
