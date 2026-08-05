/** Browser-safe configuration and output helpers for browser examples. */

export interface BrowserExampleConfig {
  /** Daemon WebSocket URL, e.g. `ws://127.0.0.1:37643`. */
  daemonUrl?: string;
  /** Factory API key. Use only for local testing, never in a deployed page. */
  apiKey?: string;
  /** Absolute path the session runs in. */
  cwd?: string;
}

const CONFIG_GLOBAL_KEY = '__DROID_EXAMPLE_CONFIG__';

function readInjectedConfig(): BrowserExampleConfig {
  const injected: unknown = Reflect.get(globalThis, CONFIG_GLOBAL_KEY);
  if (typeof injected !== 'object' || injected === null) return {};

  const pick = (key: string): string | undefined => {
    const value: unknown = Reflect.get(injected, key);
    return typeof value === 'string' ? value : undefined;
  };

  return {
    daemonUrl: pick('daemonUrl'),
    apiKey: pick('apiKey'),
    cwd: pick('cwd'),
  };
}

export function readConfig(): BrowserExampleConfig {
  return readInjectedConfig();
}

export function requireConfigValue(
  value: string | undefined,
  name: string
): string {
  if (!value) {
    throw new Error(
      `Missing "${name}". Enter it in the browser example launcher and run the example again.`
    );
  }
  return value;
}

export function report(label: string, value: unknown): void {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  console.log(label, value);

  if (typeof document === 'undefined') return;
  const output = document.querySelector('#output');
  if (!output) return;

  const entry = document.createElement('pre');
  entry.textContent = `${label}\n${text}`;
  output.append(entry);
}
