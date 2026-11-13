/**
 * Factory REST API example.
 *
 * Lists the Computers and remote sessions an API key can see, using the
 * client generated from the public Factory API spec. Listing sessions works
 * only for organizations that have that feature enabled.
 *
 * These operations take `{ client }` from `createFactoryClient({ apiKey, baseUrl })`
 * and resolve `{ data, error }`. The root `@factory/droid-sdk` REST helpers
 * take `{ apiKey, baseUrl }` and resolve the response body. Several names
 * exist on both with different contracts, so a file that imports both should
 * alias the shared names or import this entry under a namespace. A root
 * options object cannot be passed here: generated operations require a
 * `client` created with `createFactoryClient`.
 *
 * Usage:
 *   FACTORY_API_KEY=... npx tsx examples/node/rest-api.ts [baseUrl]
 */

import {
  createFactoryClient,
  listComputers,
  listSessions,
} from '@factory/droid-sdk/api';

const apiKey = process.env.FACTORY_API_KEY;
if (!apiKey) {
  throw new Error('Set FACTORY_API_KEY.');
}

const client = createFactoryClient({
  apiKey,
  baseUrl: process.argv[2],
});

const computers = await listComputers({ client });
if (computers.error !== undefined) {
  throw new Error(
    `Listing Computers failed: ${JSON.stringify(computers.error)}`
  );
}
console.log(`Computers (${computers.data.computers.length}):`);
for (const computer of computers.data.computers) {
  console.log(`  ${computer.id}  ${computer.name}  ${computer.status ?? ''}`);
}

const sessions = await listSessions({ client, query: { limit: 5 } });
if (sessions.error !== undefined) {
  throw new Error(`Listing sessions failed: ${JSON.stringify(sessions.error)}`);
}
console.log(`Recent sessions (${sessions.data.sessions.length}):`);
for (const session of sessions.data.sessions) {
  console.log(
    `  ${session.sessionId}  ${session.status}  ${session.messageCount} messages`
  );
}
