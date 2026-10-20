/**
 * Document input example.
 *
 * Attaches plain text or a base64 PDF through `files`. With no path, it uses
 * an embedded text document so the example runs as-is.
 *
 * Usage:
 *   npx tsx examples/node/document-input.ts
 *   npx tsx examples/node/document-input.ts ./report.txt
 *   npx tsx examples/node/document-input.ts ./report.pdf
 */

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { run, type DocumentSource } from '@factory/droid-sdk/node';

const inputPath = process.argv[2];
let document: DocumentSource;

if (!inputPath) {
  document = {
    type: 'text',
    mediaType: 'text/plain',
    data: [
      'Release: 2.4.0',
      'Status: Ready',
      'Main change: Added document input to the TypeScript SDK guide.',
    ].join('\n'),
    name: 'release-notes.txt',
  };
} else if (extname(inputPath).toLowerCase() === '.pdf') {
  document = {
    type: 'base64',
    mediaType: 'application/pdf',
    data: (await readFile(inputPath)).toString('base64'),
    name: basename(inputPath),
  };
} else {
  document = {
    type: 'text',
    mediaType: 'text/plain',
    data: await readFile(inputPath, 'utf8'),
    name: basename(inputPath),
  };
}

const result = await run('Summarize this document in one sentence.', {
  files: [document],
});

if (!result.success) {
  throw new Error(
    result.error?.message ?? `Document summary failed (${result.subtype}).`
  );
}

console.log(result.text);
