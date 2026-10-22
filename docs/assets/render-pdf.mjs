import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from 'pdfmake/build/vfs_fonts.js';

const here = dirname(fileURLToPath(import.meta.url));
export const defaultSource = resolve(here, 'droid-sdk-one-pager.pdf.json');
export const defaultOutput = resolve(here, '../droid-sdk-one-pager.pdf');

pdfMake.addVirtualFileSystem(fonts);

export function validateDefinition(definition, palette) {
  if (
    !definition ||
    typeof definition !== 'object' ||
    Array.isArray(definition)
  ) {
    throw new Error('The source must be a document object.');
  }
  if (!Array.isArray(definition.content) || !definition.content.length) {
    throw new Error('The source must have a non-empty content array.');
  }
  const allowed = new Set(
    Object.values(palette.colors).map((c) => c.toUpperCase())
  );
  function visit(value) {
    if (typeof value === 'string') {
      for (const color of value.match(/#[0-9a-f]{6}\b/gi) ?? []) {
        if (!allowed.has(color.toUpperCase())) {
          throw new Error(
            `Color ${color} is outside the Factory print palette.`
          );
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === 'object') {
      if (value.font !== undefined && value.font !== 'Roboto') {
        throw new Error('This renderer embeds Roboto only.');
      }
      for (const item of Object.values(value)) visit(item);
    }
  }
  visit(definition);
}

export async function validatePdf(buffer, expectedPages = 1) {
  if (!buffer.length || buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('The renderer did not produce a PDF.');
  }
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    if (document.numPages !== expectedPages) {
      throw new Error(
        `Expected ${expectedPages} page(s), got ${document.numPages}. Tighten the layout before publishing.`
      );
    }
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      pages.push(
        (await page.getTextContent()).items
          .map((item) => item.str ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
      );
    }
    if (pages.some((page) => !page.trim())) {
      throw new Error('Every page must contain selectable text.');
    }
    return { pages: document.numPages, text: pages.join('\n') };
  } finally {
    await document.destroy();
  }
}

export async function renderPdf({
  source = defaultSource,
  output = defaultOutput,
  expectedPages = 1,
} = {}) {
  const definition = JSON.parse(await readFile(source, 'utf8'));
  const palette = JSON.parse(
    await readFile(resolve(here, 'brand/palette.json'), 'utf8')
  );
  validateDefinition(definition, palette);
  // Bundle a real brand asset rather than relying on an internal checkout or URL.
  const logo = await readFile(resolve(here, 'brand/factory-lockup-black.png'));
  definition.images = {
    ...definition.images,
    factoryLockup: `data:image/png;base64,${logo.toString('base64')}`,
  };
  // Fixed metadata timestamps make repeated builds byte-identical.
  definition.info = {
    ...definition.info,
    creationDate: new Date('2026-10-22T00:00:00Z'),
    modDate: new Date('2026-10-22T00:00:00Z'),
  };
  const buffer = await new Promise((resolveBuffer, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer(resolveBuffer);
    } catch (error) {
      reject(error);
    }
  });
  const verification = await validatePdf(buffer, expectedPages);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, buffer, { flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return { ...verification, bytes: buffer.length, output };
}

export function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`${flag} needs a value.`);
    if (flag === '--source') options.source = resolve(value);
    else if (flag === '--output') options.output = resolve(value);
    else if (flag === '--pages') {
      const pages = Number(value);
      if (!Number.isSafeInteger(pages) || pages < 1) {
        throw new Error('--pages must be a positive integer.');
      }
      options.expectedPages = pages;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  return options;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await renderPdf(parseArgs(process.argv.slice(2)));
    console.log(
      `Built ${result.output}: ${result.pages} page(s), ${result.bytes} bytes.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'PDF build failed.');
    process.exitCode = 1;
  }
}
