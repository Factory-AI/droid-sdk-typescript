/** Bundles and serves the browser examples on loopback for local development. */

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const exampleDir = path.join(projectDir, 'examples', 'browser');
const port = Number(process.env.PORT ?? 8420);
const exampleNames = new Set([
  'daemon-session',
  'daemon-multi-session',
  'daemon-lifecycle',
  'list-sessions',
]);

function isAllowedHost(host) {
  if (!host) return false;

  try {
    const url = new URL(`http://${host}`);
    const isLoopback =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]';
    return isLoopback && (!url.port || url.port === String(port));
  } catch {
    return false;
  }
}

async function bundleExample(name) {
  if (!exampleNames.has(name)) {
    throw new Error(`Unknown browser example: ${name}`);
  }

  const entry = path.join(exampleDir, `${name}.ts`);
  if (path.dirname(entry) !== exampleDir) {
    throw new Error(`Refusing to bundle outside examples/browser: ${name}`);
  }

  const result = await esbuild.build({
    entryPoints: [entry],
    absWorkingDir: projectDir,
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: 'inline',
  });

  return result.outputFiles[0].text;
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden host');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

    try {
      if (pathname === '/index.html') {
        const html = await fs.readFile(
          path.join(exampleDir, 'index.html'),
          'utf8'
        );

        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(html);
        return;
      }

      if (pathname.endsWith('.js')) {
        const name = path.basename(pathname, '.js');
        const js = await bundleExample(name);
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(js);
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[serve-browser-example] ${pathname}: ${message}`);
      res.writeHead(500, {
        'content-type': 'text/javascript; charset=utf-8',
      });
      res.end(`throw new Error(${JSON.stringify(message)});`);
    }
  })();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Browser examples: http://127.0.0.1:${port}/`);
});
