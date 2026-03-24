/**
 * Unit tests for query() function and DroidQuery type.
 *
 * Uses InMemoryTransport to simulate the full query lifecycle.
 * Covers VAL-API-001, VAL-API-007, VAL-API-008, VAL-API-009, VAL-API-010.
 */

import { describe, expect, it } from "vitest";

import { query } from "../src/query.js";
import type { DroidMessage } from "../src/stream.js";
import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
} from "../src/schemas/index.js";
import { InMemoryTransport } from "./helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(
  id: string,
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: "response",
    id,
    result,
  };
}

function makeNotification(
  notificationType: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: "notification",
    method: DroidClientMethod.SESSION_NOTIFICATION,
    params: {
      notification: {
        type: notificationType,
        ...payload,
      },
    },
  };
}

/**
 * Simulate a full query lifecycle on the transport:
 * 1. Respond to initializeSession request
 * 2. Respond to addUserMessage request
 * 3. Send streaming notifications
 * 4. Send working_state_changed to idle (triggers TurnComplete)
 */
function simulateQueryLifecycle(
  transport: InMemoryTransport,
  sessionId: string,
  deltas: string[] = ["Hello", " world"],
): void {
  // We need to intercept the sent messages and respond appropriately
  let messageCount = 0;

  const originalSend = transport.send.bind(transport);
  transport.send = (message: object) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg["method"] as string;
    const id = msg["id"] as string;

    messageCount++;

    if (method === DroidServerMethod.INITIALIZE_SESSION) {
      // Respond with sessionId
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            sessionId,
            session: {},
            settings: {
              modelId: "test-model",
              reasoningEffort: "medium",
            },
          }),
        );
      });
    } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
      // Respond to addUserMessage then send streaming notifications
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));

        // Send working state change to non-idle
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.DROID_WORKING_STATE_CHANGED,
            { newState: DroidWorkingState.StreamingAssistantMessage },
          ),
        );

        // Send text deltas
        for (const delta of deltas) {
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: "msg-1",
              blockIndex: 0,
              textDelta: delta,
            }),
          );
        }

        // Send token usage
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
            {
              tokenUsage: {
                inputTokens: 100,
                outputTokens: 50,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                thinkingTokens: 0,
              },
            },
          ),
        );

        // Send working state change to idle (triggers TurnComplete)
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.DROID_WORKING_STATE_CHANGED,
            { newState: DroidWorkingState.Idle },
          ),
        );
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("query()", () => {
  describe("lifecycle (VAL-API-001)", () => {
    it("spawns transport, initializes session, sends message, yields DroidMessage, cleans up", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, "sess-001", ["Hello", " world"]);

      const messages: DroidMessage[] = [];
      const q = query({
        prompt: "Test prompt",
        cwd: "/tmp",
        transport,
      });

      for await (const msg of q) {
        messages.push(msg);
      }

      // Should have received messages: working_state_changed, text deltas, token_usage_update, working_state_changed (idle), turn_complete
      expect(messages.length).toBeGreaterThanOrEqual(5);

      // First message should be working state change
      expect(messages[0].type).toBe("working_state_changed");

      // Should contain text deltas
      const textDeltas = messages.filter(
        (m) => m.type === "assistant_text_delta",
      );
      expect(textDeltas.length).toBe(2);

      // Last message should be turn_complete
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.type).toBe("turn_complete");

      // Transport should have been sent initializeSession and addUserMessage
      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)["method"],
      );
      expect(sentMethods).toContain(DroidServerMethod.INITIALIZE_SESSION);
      expect(sentMethods).toContain(DroidServerMethod.ADD_USER_MESSAGE);

      // Transport should be closed after query completes
      expect(transport.isConnected).toBe(false);
    });

    it("passes QueryOptions to initializeSession", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, "sess-002");

      const q = query({
        prompt: "Test",
        cwd: "/my/project",
        machineId: "my-machine",
        modelId: "claude-test",
        transport,
      });

      for await (const _msg of q) {
        // consume all messages
      }

      // Check that initializeSession was called with correct params
      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)["method"] ===
          DroidServerMethod.INITIALIZE_SESSION,
      ) as Record<string, unknown>;
      expect(initMsg).toBeDefined();

      const params = initMsg["params"] as Record<string, unknown>;
      expect(params["cwd"]).toBe("/my/project");
      expect(params["machineId"]).toBe("my-machine");
      expect(params["modelId"]).toBe("claude-test");
    });

    it("sends the prompt as user message", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, "sess-003");

      const q = query({
        prompt: "Fix the bug",
        transport,
      });

      for await (const _msg of q) {
        // consume
      }

      // Check addUserMessage was called with the prompt
      const addMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)["method"] ===
          DroidServerMethod.ADD_USER_MESSAGE,
      ) as Record<string, unknown>;
      expect(addMsg).toBeDefined();

      const params = addMsg["params"] as Record<string, unknown>;
      expect(params["text"]).toBe("Fix the bug");
    });
  });

  describe("DroidQuery.interrupt() (VAL-API-007)", () => {
    it("sends interrupt_session request", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let interruptResponseSent = false;

      // Custom lifecycle that waits for interrupt
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg["method"] as string;
        const id = msg["id"] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: "sess-int",
                session: {},
                settings: { modelId: "test", reasoningEffort: "medium" },
              }),
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // Start streaming
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage },
              ),
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                { messageId: "msg-1", blockIndex: 0, textDelta: "Starting..." },
              ),
            );
          });
        } else if (method === DroidServerMethod.INTERRUPT_SESSION) {
          interruptResponseSent = true;
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // After interrupt, agent winds down
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle },
              ),
            );
          });
        }
      };

      const q = query({ prompt: "Long task", transport });

      const messages: DroidMessage[] = [];
      let interrupted = false;

      for await (const msg of q) {
        messages.push(msg);
        if (msg.type === "assistant_text_delta" && !interrupted) {
          interrupted = true;
          await q.interrupt();
        }
      }

      expect(interruptResponseSent).toBe(true);

      // Should have received turn_complete at the end
      expect(messages[messages.length - 1].type).toBe("turn_complete");

      // Verify interrupt_session was sent
      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)["method"],
      );
      expect(sentMethods).toContain(DroidServerMethod.INTERRUPT_SESSION);
    });
  });

  describe("DroidQuery.abort() (VAL-API-008)", () => {
    it("forcefully closes transport and terminates generator", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Only respond to init and addUserMessage, then stream forever
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg["method"] as string;
        const id = msg["id"] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: "sess-abort",
                session: {},
                settings: { modelId: "test", reasoningEffort: "medium" },
              }),
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage },
              ),
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                { messageId: "msg-1", blockIndex: 0, textDelta: "Starting..." },
              ),
            );
          });
        }
      };

      const q = query({ prompt: "Abort me", transport });

      const messages: DroidMessage[] = [];
      for await (const msg of q) {
        messages.push(msg);
        if (msg.type === "assistant_text_delta") {
          q.abort();
        }
      }

      // Generator should have terminated
      expect(messages.length).toBeGreaterThanOrEqual(1);

      // Transport should be closed
      expect(transport.isConnected).toBe(false);
    });
  });

  describe("DroidQuery.sessionId (VAL-API-009)", () => {
    it("is null before initialization", () => {
      const transport = new InMemoryTransport();
      // Don't connect or start — just create the query
      // sessionId should be null since we haven't started iteration
      const q = query({
        prompt: "Test",
        transport,
      });

      expect(q.sessionId).toBeNull();
    });

    it("is accessible after initialization", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, "sess-id-test");

      const q = query({ prompt: "Test", transport });

      // Consume first message to trigger initialization
      const iterator = q[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);

      // sessionId should now be set
      expect(q.sessionId).toBe("sess-id-test");

      // Consume rest
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
      }
    });
  });

  describe("cleanup on early break (VAL-API-010)", () => {
    it("closes transport when breaking out of generator early", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Set up lifecycle that never completes
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg["method"] as string;
        const id = msg["id"] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: "sess-break",
                session: {},
                settings: { modelId: "test", reasoningEffort: "medium" },
              }),
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage },
              ),
            );

            // Send several deltas
            for (let i = 0; i < 10; i++) {
              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.ASSISTANT_TEXT_DELTA,
                  {
                    messageId: "msg-1",
                    blockIndex: 0,
                    textDelta: `delta-${i} `,
                  },
                ),
              );
            }
          });
        }
      };

      const q = query({ prompt: "Long output", transport });

      let count = 0;
      for await (const _msg of q) {
        count++;
        if (count >= 3) {
          break; // Early break
        }
      }

      // Give cleanup a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Transport should be closed (no resource leak)
      expect(transport.isConnected).toBe(false);
    });
  });

  describe("permission and ask-user handlers", () => {
    it("invokes permissionHandler when set", async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let permissionCalled = false;

      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg["method"] as string;
        const id = msg["id"] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: "sess-perm",
                session: {},
                settings: { modelId: "test", reasoningEffort: "medium" },
              }),
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // Send a permission request from the server
            transport.injectMessage({
              jsonrpc: JSONRPC_VERSION,
              factoryApiVersion: LEGACY_FACTORY_API_VERSION,
              factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
              type: "request",
              id: "perm-req-1",
              method: DroidClientMethod.REQUEST_PERMISSION,
              params: { toolName: "execute", command: "rm -rf /" },
            });

            // After response, continue streaming
            setTimeout(() => {
              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.StreamingAssistantMessage },
                ),
              );
              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.Idle },
                ),
              );
            }, 20);
          });
        }
      };

      const q = query({
        prompt: "Do something",
        transport,
        permissionHandler: (_params) => {
          permissionCalled = true;
          return "proceed_once";
        },
      });

      for await (const _msg of q) {
        // consume
      }

      expect(permissionCalled).toBe(true);
    });
  });
});
