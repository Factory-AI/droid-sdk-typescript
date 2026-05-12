import {
  DroidMessageType,
  ToolConfirmationOutcome,
  createSession,
  createSdkMcpServer,
  tool,
} from '@factory/droid-sdk';
import { z } from 'zod';

const execPath = process.env['DROID_EXEC_PATH'] ?? 'droid-dev';

const sdkTools = createSdkMcpServer({
  name: 'sdk-tools',
  tools: [
    tool(
      'favorite_number',
      'Returns a favorite number for a person',
      { name: z.string() },
      ({ name }) => `${name}'s favorite number is 42.`
    ),
  ],
});

const session = await createSession({
  execPath,
  mcpServers: [sdkTools],
  cwd: process.cwd(),
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

try {
  for await (const msg of session.stream(
    'Use the favorite_number tool for Ada and tell me the answer.'
  )) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      process.stdout.write(msg.text);
    }
  }
  console.log();
} finally {
  await session.close();
}
