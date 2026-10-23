import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  defaultOutput,
  defaultSource,
  parseArgs,
  renderPdf,
  validateDefinition,
  validatePdf,
} from './render-pdf.mjs';

const palette = JSON.parse(
  await readFile(new URL('./brand/palette.json', import.meta.url), 'utf8')
);

test('CLI rejects missing, unknown, and invalid arguments', () => {
  for (const args of [
    ['--source'],
    ['--unknown', 'x'],
    ['--pages', '0'],
    ['--pages', '1.5'],
    ['--pages', 'wat'],
  ]) {
    assert.throws(() => parseArgs(args));
  }
  assert.equal(parseArgs(['--pages', '2']).expectedPages, 2);
});

test('source validation rejects invalid content, non-brand colors, and unavailable fonts', () => {
  for (const definition of [
    null,
    [],
    {},
    { content: [] },
    { content: [{ text: 'bad', color: '#123456' }] },
    { content: [{ text: 'bad', font: 'Unknown' }] },
  ]) {
    assert.throws(() => validateDefinition(definition, palette));
  }
  validateDefinition(
    { content: [{ text: 'Factory', color: '#FF5A00' }] },
    palette
  );
});

test('PDF validation rejects non-PDF input', async () => {
  await assert.rejects(
    validatePdf(Buffer.from('not a PDF')),
    /did not produce/
  );
});

test('handout builds reproducibly and includes branding and verified sponsor track', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'factory-print-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, 'first.pdf');
  const second = join(directory, 'second.pdf');
  const result = await renderPdf({ output: first });
  await renderPdf({ output: second });
  assert.equal(result.pages, 1);
  assert.match(result.text, /Droid SDK/);
  assert.match(result.text, /Best Use of the Factory Droid SDK/);
  assert.match(result.text, /\$2,000/);
  assert.match(result.text, /README/);
  assert.match(result.text, /Build a project that uses an agent/);
  assert.match(result.text, /Use TypeScript or Python/);
  assert.match(result.text, /Scan\. Run\. Make it yours\./);
  assert.match(result.text, /User asks/);
  assert.match(result.text, /Droid checks/);
  assert.match(result.text, /App shows/);
  assert.match(result.text, /User approves/);
  assert.doesNotMatch(result.text, /npm ci|USE EXEC|All activity data/);
  assert.deepEqual(await readFile(first), await readFile(second));
  assert.deepEqual(
    await readFile(first),
    await readFile(defaultOutput),
    'The checked-in PDF must match its editable source; run the build after editing.'
  );
  await assert.rejects(
    validatePdf(await readFile(first), 2),
    /Expected 2 page/
  );
});

test('overflow fails before replacing the existing output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'factory-print-overflow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const definition = JSON.parse(await readFile(defaultSource, 'utf8'));
  definition.content.push({ text: 'Second page', pageBreak: 'before' });
  const source = join(directory, 'overflow.json');
  const output = join(directory, 'existing.pdf');
  await writeFile(source, JSON.stringify(definition));
  await writeFile(output, 'keep me');
  await assert.rejects(renderPdf({ source, output }), /Expected 1 page/);
  assert.equal(await readFile(output, 'utf8'), 'keep me');
});
