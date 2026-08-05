/**
 * Daemon connection from a browser: run a turn and approve its tool use.
 *
 * Bundle this file with `platform: 'browser'`, serve it with index.html, and
 * click "Run daemon session".
 * Never commit a real API key or deploy it in browser code.
 */

import {
  AutonomyLevel,
  connectToDaemon,
  DroidMessageType,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';

import { readConfig, report, requireConfigValue } from './config.js';

const config = readConfig();
const daemonUrl = config.daemonUrl ?? 'ws://127.0.0.1:37643';
const apiKey = requireConfigValue(config.apiKey, 'apiKey');
const cwd = requireConfigValue(config.cwd, 'cwd');

report('status', `Connecting to ${daemonUrl}`);
const droid = await connectToDaemon({
  url: daemonUrl,
  auth: { apiKey },
});

let approvedPermission = false;
try {
  const session = await droid.sessions.create({
    cwd,
    // Off ensures even low-risk commands exercise the permission handler.
    autonomyLevel: AutonomyLevel.Off,
    permissionHandler: () => {
      approvedPermission = true;
      report('permission', 'Approved one tool use.');
      return ToolConfirmationOutcome.ProceedOnce;
    },
  });
  report('session created', session.id);

  try {
    for await (const message of session.stream(
      'Run `echo hello from the browser example` and show me the output.'
    )) {
      if (message.type === DroidMessageType.Assistant) {
        report('assistant', message.text);
      }
    }

    if (!approvedPermission) {
      throw new Error('Turn finished without requesting permission.');
    }
    report('status', 'Turn completed.');
  } finally {
    await session.close();
  }
} finally {
  droid.disconnect();
}
