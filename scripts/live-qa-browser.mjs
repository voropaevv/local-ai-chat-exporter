import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { EventEmitter } from "node:events";

// Official NUL-delimited root CDP pipe; no Target.attachToBrowserTarget is needed.
export function createPipeProtocol(input, output) {
  let nextId = 0;
  let buffered = "";
  const pending = new Map();
  let closed = false;
  const events = new EventEmitter();
  function close() {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error("Browser protocol disconnected"));
    }
    pending.clear();
  }
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    buffered += chunk;
    let delimiter;
    while ((delimiter = buffered.indexOf("\0")) !== -1) {
      const frame = buffered.slice(0, delimiter);
      buffered = buffered.slice(delimiter + 1);
      if (!frame) continue;
      let message;
      try {
        message = JSON.parse(frame);
      } catch {
        close();
        return;
      }
      if (message.method) events.emit(message.method, message.params);
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result);
    }
    if (buffered.length > 8 * 1024 * 1024) close();
  });
  output.on("end", close);
  output.on("error", close);
  input.on("error", close);
  return {
    send(method, params = {}, timeoutMs = 30000) {
      if (closed) return Promise.reject(new Error("Browser protocol disconnected"));
      const id = ++nextId;
      return new Promise((done, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method}: protocol deadline exceeded`));
        }, timeoutMs);
        pending.set(id, { resolve: done, reject, timer, method });
        input.write(`${JSON.stringify({ id, method, params })}\0`);
      });
    },
    on: (name, listener) => events.on(name, listener),
    off: (name, listener) => events.off(name, listener),
    close
  };
}

export async function launchQaBrowser(executablePath, profile, headless) {
  const started = Date.now();
  const child = spawn(
    executablePath,
    [
      "--remote-debugging-pipe",
      "--remote-debugging-port=0",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(headless ? ["--headless=new"] : []),
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"], detached: process.platform !== "win32" }
  );
  let ended = false;
  let logs = "";
  child.once("exit", () => {
    ended = true;
  });
  child.once("close", () => {
    ended = true;
  });
  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-4096);
  });
  const protocol = createPipeProtocol(child.stdio[3], child.stdio[4]);
  let browser;
  const group = process.platform !== "win32" ? child.pid : null;
  const owner = { pid: child.pid, processGroup: group, startedAt: new Date(started).toISOString() };
  function alive() {
    if (!child.pid) return false;
    if (!group) return !ended;
    try {
      process.kill(-group, 0);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  }
  function terminate(signal) {
    if (!alive()) return;
    if (group) process.kill(-group, signal);
    else child.kill(signal);
  }
  async function waitStopped(deadlineMs) {
    const deadline = Date.now() + deadlineMs;
    while (alive() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 50));
  }
  let closing;
  function close() {
    closing ??= (async () => {
      try {
        if (alive()) await protocol.send("Browser.close", {}, 2000).catch(() => {});
        await waitStopped(2000);
        if (alive()) {
          terminate("SIGTERM");
          await waitStopped(3000);
        }
        if (alive()) {
          terminate("SIGKILL");
          await waitStopped(3000);
        }
        if (alive()) throw new Error(`Owned browser group ${group ?? child.pid} did not stop`);
        return "closed_verified";
      } finally {
        protocol.close();
        child.stdio.forEach((stream) => stream?.destroy());
        await browser?.close().catch(() => {});
      }
    })();
    return closing;
  }
  try {
    await new Promise((done, reject) => {
      child.once("spawn", done);
      child.once("error", reject);
    });
    let endpoint;
    while (Date.now() - started < 15000 && !ended) {
      const activePort = resolve(profile, "DevToolsActivePort");
      try {
        if ((await stat(activePort)).mtimeMs >= started) {
          const [port, websocket] = (await readFile(activePort, "utf8")).trim().split("\n");
          if (/^\d+$/.test(port) && websocket.startsWith("/devtools/browser/")) {
            endpoint = `ws://127.0.0.1:${port}${websocket}`;
            break;
          }
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    if (!endpoint) throw new Error(`Browser did not expose its current local endpoint: ${logs}`);
    browser = await chromium.connectOverCDP(endpoint, {
      noDefaults: true,
      isLocal: true,
      timeout: 15000
    });
    const context = browser.contexts()[0];
    if (!context) throw new Error("Browser has no default context");
    return { context, protocol, owner, close };
  } catch (error) {
    try {
      error.resource = { owner, cleanup: await close() };
    } catch (cleanupError) {
      const combined = new Error(`${error.message}; ${cleanupError.message}`);
      combined.resource = { owner, cleanup: "closure_unverified" };
      throw combined;
    }
    throw error;
  }
}
