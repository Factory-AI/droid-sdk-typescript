import { connect, createServer } from 'node:net';

export function childEnv(
  base,
  { keepEnv = false } = {},
  inherited = process.env
) {
  const env = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (!keepEnv && /^(FACTORY_|DROID_)/.test(key) && key !== 'FACTORY_API_KEY')
      continue;
    env[key] = value;
  }
  return { ...env, ...base };
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function waitForPort(port, timeoutMs = 30_000, child) {
  let failure;
  const onError = (error) => {
    failure = error;
  };
  const onExit = (code, signal) => {
    failure = new Error(
      `Helper exited before opening port ${port}: ${signal ?? code}`
    );
  };
  child?.once('error', onError);
  child?.once('exit', onExit);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (child && (child.exitCode !== null || child.signalCode !== null)) {
        throw new Error(`Helper exited before opening port ${port}`);
      }
      const open = await new Promise((resolve) => {
        const socket = connect(port, '127.0.0.1');
        socket.once('connect', () => (socket.destroy(), resolve(true)));
        socket.once('error', () => (socket.destroy(), resolve(false)));
      });
      if (failure) throw failure;
      if (open) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Port ${port} did not open in ${timeoutMs}ms`);
  } finally {
    child?.removeListener('error', onError);
    child?.removeListener('exit', onExit);
  }
}

export function killTree(child, signal = 'SIGTERM') {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}
