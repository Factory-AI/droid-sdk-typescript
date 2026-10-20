/**
 * Type-checks the ```ts code blocks in README.md, MIGRATION.md, and docs/
 * against the installed SDK.
 *
 * Many blocks are fragments that use names from the text around them, such as
 * `session` or a bare `createSession`. The check runs in two passes: the
 * first pass collects the names that TypeScript cannot find, and the second
 * pass adds a hidden prelude that imports those names from
 * `@factory/droid-sdk/node` or declares them from CONTEXT below. Names that
 * are neither exported by the SDK nor listed in CONTEXT stay errors, so a
 * renamed or removed SDK export still fails the check.
 *
 * Markers on the line before a fence:
 *   <!-- snippet-skip -->               the block is not meant to compile
 *   <!-- snippet-prelude: <code> -->    extra code to put before the block
 *
 * Usage:
 *   node scripts/check-doc-snippets.mjs
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(repoRoot, 'node_modules', '.cache', 'doc-snippets');
const SDK = '@factory/droid-sdk/node';

/** Typed stand-ins for names that the docs introduce in prose. */
const CONTEXT = {
  session: 'declare const session: DroidSession;',
  droid: 'declare const droid: ConnectedDroid;',
  source: 'declare const source: ConnectedDroidSession;',
  first: 'declare const first: ConnectedDroidSession;',
  second: 'declare const second: ConnectedDroidSession;',
  result: 'declare const result: DroidResult;',
  request: 'declare const request: Parameters<ClientPermissionHandler>[0];',
  permissionHandler:
    'declare const permissionHandler: ClientPermissionHandler;',
  askUserHandler: 'declare const askUserHandler: ClientAskUserHandler;',
  stringTransport:
    'declare const stringTransport: StringFramedDroidClientTransport;',
  consume:
    'declare function consume(stream: AsyncIterable<unknown>): Promise<void>;',
  messageId: 'declare const messageId: string;',
  filesToRestore:
    "declare const filesToRestore: GetRewindInfoResult['availableFiles'];",
  filesToDelete:
    "declare const filesToDelete: GetRewindInfoResult['createdFiles'];",
  logger:
    'declare const logger: { info(message: string, metadata?: unknown): void; error(message: string, metadata?: unknown): void };',
  apiKey: 'declare const apiKey: string;',
  base64Png: 'declare const base64Png: string;',
  report: 'declare const report: string;',
  currentTraceparent: 'declare const currentTraceparent: string;',
};
const CONTEXT_TYPES = [
  'DroidSession',
  'ConnectedDroid',
  'ConnectedDroidSession',
  'DroidResult',
  'ClientPermissionHandler',
  'ClientAskUserHandler',
  'StringFramedDroidClientTransport',
  'GetRewindInfoResult',
];

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
  types: ['node'],
  isolatedModules: true,
  noFallthroughCasesInSwitch: true,
};

// ---------------------------------------------------------------------------

async function extractSnippets() {
  const docs = [
    join(repoRoot, 'README.md'),
    join(repoRoot, 'MIGRATION.md'),
    ...(await readdir(join(repoRoot, 'docs')))
      .filter((name) => name.endsWith('.md'))
      .map((name) => join(repoRoot, 'docs', name)),
  ];
  const snippets = [];
  let skipped = 0;
  for (const doc of docs) {
    const lines = (await readFile(doc, 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const fence = /^(\s*)```(ts|typescript)\s*$/.exec(lines[i]);
      if (!fence) continue;
      const indent = fence[1];
      const start = i + 1;
      let end = start;
      while (end < lines.length && lines[end].trim() !== '```') end++;

      let previous = i - 1;
      while (previous >= 0 && lines[previous].trim() === '') previous--;
      const marker = previous >= 0 ? lines[previous].trim() : '';
      i = end;
      if (/^<!--\s*snippet-skip\s*-->$/.test(marker)) {
        skipped++;
        continue;
      }
      const prelude =
        /^<!--\s*snippet-prelude:\s*([\s\S]*?)\s*-->$/.exec(marker)?.[1] ?? '';
      const body = lines
        .slice(start, end)
        .map((line) =>
          line.startsWith(indent) ? line.slice(indent.length) : line
        )
        .join('\n');
      snippets.push({
        doc: relative(repoRoot, doc),
        start: start + 1,
        prelude,
        body,
        file: join(
          outDir,
          `snippet-${String(snippets.length + 1).padStart(3, '0')}.ts`
        ),
      });
    }
  }
  return { snippets, skipped };
}

function sdkExports() {
  const probe = join(outDir, '__exports.ts');
  const host = ts.createCompilerHost(compilerOptions);
  const readFileOrig = host.readFile;
  host.readFile = (name) =>
    name === probe
      ? `import * as sdk from '${SDK}';\nexport { sdk };\n`
      : readFileOrig(name);
  const fileExistsOrig = host.fileExists;
  host.fileExists = (name) => name === probe || fileExistsOrig(name);
  const program = ts.createProgram([probe], compilerOptions, host);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(probe);
  const specifier = source.statements[0].moduleSpecifier;
  const moduleSymbol = checker.getSymbolAtLocation(specifier);
  if (!moduleSymbol)
    throw new Error(`Cannot resolve ${SDK}. Run npm ci first.`);
  return new Set(checker.getExportsOfModule(moduleSymbol).map((s) => s.name));
}

function preludeFor(snippet, missing, exported) {
  const imports = new Set();
  const declarations = [];
  for (const name of missing) {
    if (CONTEXT[name]) declarations.push(CONTEXT[name]);
    else if (exported.has(name)) imports.add(name);
  }
  if (declarations.length > 0) {
    for (const type of CONTEXT_TYPES) {
      if (declarations.some((d) => new RegExp(`\\b${type}\\b`).test(d)))
        imports.add(type);
    }
  }
  const lines = [];
  if (imports.size > 0)
    lines.push(`import { ${[...imports].sort().join(', ')} } from '${SDK}';`);
  lines.push(...declarations);
  if (snippet.prelude) lines.push(snippet.prelude);
  return lines;
}

function compile(files) {
  const program = ts.createProgram(files, compilerOptions);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && files.includes(d.file.fileName));
}

const MISSING_NAME = [2304, 2552, 18004, 2582];

function missingName(diagnostic) {
  if (!MISSING_NAME.includes(diagnostic.code)) return undefined;
  return /'([A-Za-z_$][\w$]*)'/.exec(
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  )?.[1];
}

// ---------------------------------------------------------------------------

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const { snippets, skipped } = await extractSnippets();
const exported = sdkExports();

// Pass 1: find the names each fragment assumes.
for (const s of snippets) {
  s.preludeLines = s.prelude ? [s.prelude] : [];
  await writeFile(
    s.file,
    `${s.preludeLines.join('\n')}${s.preludeLines.length ? '\n' : ''}${s.body}\n\nexport {};\n`
  );
}
const firstPass = compile(snippets.map((s) => s.file));
const missingByFile = new Map();
for (const d of firstPass) {
  const name = missingName(d);
  if (!name) continue;
  if (!missingByFile.has(d.file.fileName))
    missingByFile.set(d.file.fileName, new Set());
  missingByFile.get(d.file.fileName).add(name);
}

// Pass 2: add the prelude and report what is still wrong.
for (const s of snippets) {
  s.preludeLines = preludeFor(
    s,
    missingByFile.get(s.file) ?? new Set(),
    exported
  );
  await writeFile(
    s.file,
    `${s.preludeLines.join('\n')}${s.preludeLines.length ? '\n' : ''}${s.body}\n\nexport {};\n`
  );
}
const diagnostics = compile(snippets.map((s) => s.file));
const byFile = new Map(snippets.map((s) => [s.file, s]));

for (const d of diagnostics) {
  const s = byFile.get(d.file.fileName);
  const { line, character } = d.file.getLineAndCharacterOfPosition(
    d.start ?? 0
  );
  const bodyLine = line - s.preludeLines.length;
  const where =
    bodyLine >= 0
      ? `${s.doc}:${s.start + bodyLine}:${character + 1}`
      : `${s.doc}:${s.start} (prelude)`;
  console.log(
    `${where} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
  );
}

console.log(
  `\nChecked ${snippets.length} snippet(s), skipped ${skipped}: ${diagnostics.length} error(s).`
);
process.exitCode = diagnostics.length === 0 ? 0 : 1;
