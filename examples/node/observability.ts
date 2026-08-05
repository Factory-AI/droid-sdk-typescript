/**
 * Observability example.
 *
 * Passes a `DroidObservability` bundle (logger, metrics, tracing) to
 * `createSession()`, which wires it into both the spawned droid process
 * transport and the client. Spawning the process records a spawn-latency
 * metric and a log; every outgoing request asks the tracing sink to inject
 * trace context into the request's `_meta`.
 *
 * The example then runs one real conversational turn through
 * `session.stream()` so the sinks observe request/response traffic from actual
 * work rather than only process startup.
 *
 * Sinks only ever receive structured, privacy-safe values — never raw
 * stdout/stderr or message content.
 *
 * Usage:
 *   npx tsx examples/node/observability.ts
 */

import {
  DroidMessageType,
  createSession,
  type DroidLogEvent,
  type DroidMetricEvent,
  type DroidObservability,
  type DroidTraceContextCarrier,
} from '@factory/droid-sdk/node';

let logCount = 0;

const observability: DroidObservability = {
  logger: {
    log(event: DroidLogEvent): void {
      logCount++;
      console.log(
        `[log:${event.level}] ${event.name} — ${event.message}`,
        event.attributes ?? {}
      );
    },
  },
  metrics: {
    record(event: DroidMetricEvent): void {
      console.log(
        `[metric] ${event.name}=${event.value}${event.unit} (${event.kind})`,
        event.attributes ?? {}
      );
    },
  },
  tracing: {
    inject(carrier: DroidTraceContextCarrier): void {
      // Populate the carrier from your tracer's active span. The SDK copies
      // traceparent/tracestate into each request's `_meta`.
      carrier.traceparent =
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      carrier.tracestate = 'factory=1';
    },
  },
};

const session = await createSession({ observability });

// Snapshot before the turn. Spawning the process alone emits a log, so a
// total-count assertion would pass having observed only startup. Logs are also
// the only turn-scoped signal here: the SDK's sole metric is spawn latency,
// recorded before the turn begins, so metrics cannot witness turn traffic.
const logCountBeforeTurn = logCount;
let turnLogCount = 0;

try {
  for await (const msg of session.stream(
    'Reply with the single word: ready.'
  )) {
    if (msg.type === DroidMessageType.Assistant) {
      console.log(`[assistant] ${msg.text}`);
    }
  }
  // Measure before teardown: `session.close()` sends a `close_session` request,
  // which is itself logged, so counting after the `finally` would always find
  // at least one log regardless of what the turn did.
  turnLogCount = logCount - logCountBeforeTurn;
} finally {
  await session.close();
}

if (turnLogCount === 0) {
  throw new Error('Observability sinks saw no logged requests for the turn.');
}
