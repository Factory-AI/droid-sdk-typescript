/**
 * Skills example.
 *
 * Adds a project skill in a throwaway directory, then lists the skills that a
 * session in that directory can use. A project skill is a
 * `.factory/skills/<name>/SKILL.md` file in the session `cwd`.
 *
 * Usage:
 *   npx tsx examples/node/skills.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSession } from '@factory/droid-sdk/node';

const skillName = 'release-notes';
const projectDir = await mkdtemp(join(tmpdir(), 'droid-sdk-skills-'));

try {
  await mkdir(join(projectDir, '.factory', 'skills', skillName), {
    recursive: true,
  });
  await writeFile(
    join(projectDir, '.factory', 'skills', skillName, 'SKILL.md'),
    [
      '---',
      `name: ${skillName}`,
      'description: Write release notes from the commits since the last tag.',
      '---',
      '',
      'List the commits since the last tag and group them by type.',
      '',
    ].join('\n')
  );

  const session = await createSession({ cwd: projectDir });

  try {
    const { skills } = await session.listSkills();

    for (const skill of skills) {
      console.log(
        `${skill.name} (${skill.location}): ${skill.enabled === false ? 'disabled' : 'enabled'}`
      );
    }

    if (!skills.some((skill) => skill.name === skillName)) {
      throw new Error(`The project skill ${skillName} is not listed.`);
    }
  } finally {
    await session.close();
  }
} finally {
  await rm(projectDir, { recursive: true, force: true });
}
