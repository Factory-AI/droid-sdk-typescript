import { describe, it, expect } from "vitest";
import {
  ConnectionError,
  ProtocolError,
  SessionError,
  SessionNotFoundError,
  TimeoutError,
  ProcessExitError,
} from "../src/errors.js";
import {
  DEFAULT_REQUEST_TIMEOUT,
  SESSION_INIT_TIMEOUT,
  MCP_AUTH_TIMEOUT,
} from "../src/constants.js";

// ---------------------------------------------------------------------------
// VAL-ERROR-001: Error classes have correct inheritance and names
// ---------------------------------------------------------------------------

describe("Error hierarchy — inheritance and names", () => {
  describe("ConnectionError", () => {
    it("extends Error", () => {
      const err = new ConnectionError("connection failed");
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of ConnectionError", () => {
      const err = new ConnectionError("connection failed");
      expect(err).toBeInstanceOf(ConnectionError);
    });

    it('has name "ConnectionError"', () => {
      const err = new ConnectionError("connection failed");
      expect(err.name).toBe("ConnectionError");
    });

    it("has the correct message", () => {
      const err = new ConnectionError("cannot reach droid");
      expect(err.message).toBe("cannot reach droid");
    });
  });

  describe("ProtocolError", () => {
    it("extends Error", () => {
      const err = new ProtocolError("bad response");
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of ProtocolError", () => {
      const err = new ProtocolError("bad response");
      expect(err).toBeInstanceOf(ProtocolError);
    });

    it('has name "ProtocolError"', () => {
      const err = new ProtocolError("bad response");
      expect(err.name).toBe("ProtocolError");
    });

    it("has the correct message", () => {
      const err = new ProtocolError("invalid envelope");
      expect(err.message).toBe("invalid envelope");
    });
  });

  describe("SessionError", () => {
    it("extends Error", () => {
      const err = new SessionError("session problem");
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of SessionError", () => {
      const err = new SessionError("session problem");
      expect(err).toBeInstanceOf(SessionError);
    });

    it('has name "SessionError"', () => {
      const err = new SessionError("session problem");
      expect(err.name).toBe("SessionError");
    });

    it("has the correct message", () => {
      const err = new SessionError("session expired");
      expect(err.message).toBe("session expired");
    });
  });

  describe("SessionNotFoundError", () => {
    it("extends Error", () => {
      const err = new SessionNotFoundError("abc-123");
      expect(err).toBeInstanceOf(Error);
    });

    it("extends SessionError", () => {
      const err = new SessionNotFoundError("abc-123");
      expect(err).toBeInstanceOf(SessionError);
    });

    it("is an instance of SessionNotFoundError", () => {
      const err = new SessionNotFoundError("abc-123");
      expect(err).toBeInstanceOf(SessionNotFoundError);
    });

    it('has name "SessionNotFoundError"', () => {
      const err = new SessionNotFoundError("abc-123");
      expect(err.name).toBe("SessionNotFoundError");
    });

    it("has the correct default message", () => {
      const err = new SessionNotFoundError("abc-123");
      expect(err.message).toBe("Session not found: abc-123");
    });
  });

  describe("TimeoutError", () => {
    it("extends Error", () => {
      const err = new TimeoutError("timed out");
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of TimeoutError", () => {
      const err = new TimeoutError("timed out");
      expect(err).toBeInstanceOf(TimeoutError);
    });

    it('has name "TimeoutError"', () => {
      const err = new TimeoutError("timed out");
      expect(err.name).toBe("TimeoutError");
    });

    it("has the correct message", () => {
      const err = new TimeoutError("request timed out after 30s");
      expect(err.message).toBe("request timed out after 30s");
    });
  });

  describe("ProcessExitError", () => {
    it("extends Error", () => {
      const err = new ProcessExitError("process died");
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of ProcessExitError", () => {
      const err = new ProcessExitError("process died");
      expect(err).toBeInstanceOf(ProcessExitError);
    });

    it('has name "ProcessExitError"', () => {
      const err = new ProcessExitError("process died");
      expect(err.name).toBe("ProcessExitError");
    });

    it("has the correct message", () => {
      const err = new ProcessExitError("unexpected exit");
      expect(err.message).toBe("unexpected exit");
    });
  });

  describe("cross-class instanceof checks", () => {
    it("ConnectionError is not an instance of ProtocolError", () => {
      const err = new ConnectionError("test");
      expect(err).not.toBeInstanceOf(ProtocolError);
    });

    it("ProtocolError is not an instance of SessionError", () => {
      const err = new ProtocolError("test");
      expect(err).not.toBeInstanceOf(SessionError);
    });

    it("TimeoutError is not an instance of ProcessExitError", () => {
      const err = new TimeoutError("test");
      expect(err).not.toBeInstanceOf(ProcessExitError);
    });

    it("SessionNotFoundError is not an instance of ConnectionError", () => {
      const err = new SessionNotFoundError("id");
      expect(err).not.toBeInstanceOf(ConnectionError);
    });
  });
});

// ---------------------------------------------------------------------------
// VAL-ERROR-002: Error classes carry expected metadata
// ---------------------------------------------------------------------------

describe("Error metadata fields", () => {
  describe("ConnectionError metadata", () => {
    it("has cwd and execPath with provided values", () => {
      const err = new ConnectionError("fail", {
        cwd: "/home/user/project",
        execPath: "/usr/bin/droid",
      });
      expect(err.cwd).toBe("/home/user/project");
      expect(err.execPath).toBe("/usr/bin/droid");
    });

    it("defaults cwd to empty string when not provided", () => {
      const err = new ConnectionError("fail");
      expect(err.cwd).toBe("");
    });

    it("defaults execPath to empty string when not provided", () => {
      const err = new ConnectionError("fail");
      expect(err.execPath).toBe("");
    });

    it("handles partial options (only cwd)", () => {
      const err = new ConnectionError("fail", { cwd: "/tmp" });
      expect(err.cwd).toBe("/tmp");
      expect(err.execPath).toBe("");
    });

    it("handles partial options (only execPath)", () => {
      const err = new ConnectionError("fail", { execPath: "/bin/droid" });
      expect(err.cwd).toBe("");
      expect(err.execPath).toBe("/bin/droid");
    });
  });

  describe("ProtocolError metadata", () => {
    it("has code and data with provided values", () => {
      const err = new ProtocolError("protocol fail", {
        code: -32600,
        data: { detail: "invalid request" },
      });
      expect(err.code).toBe(-32600);
      expect(err.data).toEqual({ detail: "invalid request" });
    });

    it("code is undefined when not provided", () => {
      const err = new ProtocolError("protocol fail");
      expect(err.code).toBeUndefined();
    });

    it("data is undefined when not provided", () => {
      const err = new ProtocolError("protocol fail");
      expect(err.data).toBeUndefined();
    });

    it("handles code-only options", () => {
      const err = new ProtocolError("fail", { code: -32601 });
      expect(err.code).toBe(-32601);
      expect(err.data).toBeUndefined();
    });

    it("handles data-only options", () => {
      const err = new ProtocolError("fail", { data: "extra info" });
      expect(err.code).toBeUndefined();
      expect(err.data).toBe("extra info");
    });

    it("accepts any type for data (unknown)", () => {
      const err1 = new ProtocolError("fail", { data: 42 });
      expect(err1.data).toBe(42);

      const err2 = new ProtocolError("fail", { data: null });
      expect(err2.data).toBeNull();

      const err3 = new ProtocolError("fail", { data: [1, 2, 3] });
      expect(err3.data).toEqual([1, 2, 3]);
    });
  });

  describe("SessionNotFoundError metadata", () => {
    it("has sessionId with provided value", () => {
      const err = new SessionNotFoundError("sess-abc-123");
      expect(err.sessionId).toBe("sess-abc-123");
    });

    it("includes sessionId in the error message", () => {
      const err = new SessionNotFoundError("my-session-id");
      expect(err.message).toContain("my-session-id");
    });

    it("sessionId is accessible as a string", () => {
      const err = new SessionNotFoundError("uuid-value");
      expect(typeof err.sessionId).toBe("string");
    });
  });

  describe("ProcessExitError metadata", () => {
    it("has exitCode and signal with provided values", () => {
      const err = new ProcessExitError("process crashed", {
        exitCode: 1,
        signal: "SIGTERM",
      });
      expect(err.exitCode).toBe(1);
      expect(err.signal).toBe("SIGTERM");
    });

    it("defaults exitCode to null when not provided", () => {
      const err = new ProcessExitError("process crashed");
      expect(err.exitCode).toBeNull();
    });

    it("defaults signal to null when not provided", () => {
      const err = new ProcessExitError("process crashed");
      expect(err.signal).toBeNull();
    });

    it("handles exitCode-only options", () => {
      const err = new ProcessExitError("fail", { exitCode: 137 });
      expect(err.exitCode).toBe(137);
      expect(err.signal).toBeNull();
    });

    it("handles signal-only options", () => {
      const err = new ProcessExitError("fail", { signal: "SIGKILL" });
      expect(err.exitCode).toBeNull();
      expect(err.signal).toBe("SIGKILL");
    });

    it("accepts null for exitCode explicitly", () => {
      const err = new ProcessExitError("fail", { exitCode: null });
      expect(err.exitCode).toBeNull();
    });

    it("accepts null for signal explicitly", () => {
      const err = new ProcessExitError("fail", { signal: null });
      expect(err.signal).toBeNull();
    });

    it("accepts exitCode of 0", () => {
      const err = new ProcessExitError("exited normally", { exitCode: 0 });
      expect(err.exitCode).toBe(0);
    });
  });

  describe("TimeoutError metadata", () => {
    it("carries the message describing the timeout", () => {
      const err = new TimeoutError(
        "Request timed out after 30000ms (method: droid.initialize_session)",
      );
      expect(err.message).toBe(
        "Request timed out after 30000ms (method: droid.initialize_session)",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Timeout constants
// ---------------------------------------------------------------------------

describe("Timeout constants", () => {
  it("DEFAULT_REQUEST_TIMEOUT is 30000", () => {
    expect(DEFAULT_REQUEST_TIMEOUT).toBe(30_000);
  });

  it("SESSION_INIT_TIMEOUT is 60000", () => {
    expect(SESSION_INIT_TIMEOUT).toBe(60_000);
  });

  it("MCP_AUTH_TIMEOUT is 300000", () => {
    expect(MCP_AUTH_TIMEOUT).toBe(300_000);
  });

  it("all timeout constants are positive numbers", () => {
    expect(DEFAULT_REQUEST_TIMEOUT).toBeGreaterThan(0);
    expect(SESSION_INIT_TIMEOUT).toBeGreaterThan(0);
    expect(MCP_AUTH_TIMEOUT).toBeGreaterThan(0);
  });

  it("timeouts are in ascending order", () => {
    expect(DEFAULT_REQUEST_TIMEOUT).toBeLessThan(SESSION_INIT_TIMEOUT);
    expect(SESSION_INIT_TIMEOUT).toBeLessThan(MCP_AUTH_TIMEOUT);
  });
});

// ---------------------------------------------------------------------------
// Stack trace and error behavior
// ---------------------------------------------------------------------------

describe("Error behavior", () => {
  it("errors produce stack traces", () => {
    const err = new ConnectionError("test");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("ConnectionError");
  });

  it("errors can be caught as Error", () => {
    try {
      throw new ProtocolError("test");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("SessionNotFoundError can be caught as SessionError", () => {
    try {
      throw new SessionNotFoundError("id-1");
    } catch (e) {
      expect(e).toBeInstanceOf(SessionError);
    }
  });

  it("error properties are readonly", () => {
    const err = new ConnectionError("test", {
      cwd: "/home",
      execPath: "/bin/droid",
    });
    // TypeScript enforces readonly, but we can verify the value stays
    expect(err.cwd).toBe("/home");
    expect(err.execPath).toBe("/bin/droid");
  });
});
