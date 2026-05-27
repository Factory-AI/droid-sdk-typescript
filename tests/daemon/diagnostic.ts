/**
 * Diagnostic: raw notification inspection.
 *
 * Connects, creates a session, sends a message, and logs every
 * notification received to understand what the daemon actually sends.
 */

import { connectDaemon } from '../../src/daemon/index.js';

async function main(): Promise<void> {
  console.log('Connecting...');
  const connection = await connectDaemon({
    apiKey: process.env.FACTORY_API_KEY,
  });
  console.log('Connected.');

  console.log('Creating session...');
  const session = await connection.createSession({
    cwd: process.cwd(),
  });
  console.log(`Session: ${session.sessionId}`);

  // Subscribe to ALL raw notifications
  let notifCount = 0;
  session.onNotification((n) => {
    notifCount++;
    const raw = n as Record<string, unknown>;
    const type = raw['type'] ?? 'unknown';
    // For working state changes, show the state
    if (type === 'droid_working_state_changed') {
      console.log(`  [notif #${notifCount}] ${type} → ${raw['newState']}`);
    } else if (type === 'assistant_text_delta') {
      const delta = String(raw['textDelta'] ?? '').slice(0, 30);
      console.log(`  [notif #${notifCount}] ${type}: "${delta}..."`);
    } else if (type === 'create_message') {
      const msg = raw['message'] as Record<string, unknown> | undefined;
      console.log(`  [notif #${notifCount}] ${type} role=${msg?.['role']}`);
    } else if (type === 'session_token_usage_changed') {
      const tu = raw['tokenUsage'] as Record<string, unknown> | undefined;
      console.log(
        `  [notif #${notifCount}] ${type} in=${tu?.['inputTokens']} out=${tu?.['outputTokens']}`
      );
    } else {
      console.log(`  [notif #${notifCount}] ${type}`);
    }
  });

  console.log('\nSending message via send() (fire-and-forget)...');
  await session.send('What is 2 + 2? Reply with just the number.');
  console.log('send() returned (ACK received).');

  // Wait for notifications
  console.log('Waiting 15s for notifications...');
  await new Promise((r) => setTimeout(r, 15_000));

  console.log(`\nTotal notifications received: ${notifCount}`);

  console.log('\nNow trying stream()...');
  const timeout = setTimeout(() => {
    console.log('\nSTREAM TIMED OUT after 30s');
    console.log(`Notifications during stream: ${notifCount}`);
    process.exit(1);
  }, 30_000);

  let msgCount = 0;
  try {
    for await (const msg of session.stream(
      'What is 3 + 3? Reply with just the number.'
    )) {
      msgCount++;
      console.log(`  [stream msg #${msgCount}] type=${msg.type}`);
      if (msg.type === 'result') {
        console.log(`    result: ${msg.result.slice(0, 100)}`);
        break;
      }
    }
    clearTimeout(timeout);
    console.log(`Stream completed. Total stream messages: ${msgCount}`);
  } catch (e) {
    clearTimeout(timeout);
    console.log(`Stream error: ${(e as Error).message}`);
  }

  await session.close();
  await connection.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
