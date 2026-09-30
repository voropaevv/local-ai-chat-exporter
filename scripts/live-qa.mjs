/* global chrome, document */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyBuildProvenance } from "./build-provenance.mjs";
import { launchQaBrowser } from "./live-qa-browser.mjs";
import {
  LIVE_QA_CONTRACT,
  contractSha256,
  sha256,
  compareExport,
  validateMatrix,
  verifyInstallation,
  verifyVisibility
} from "./live-qa-contract.mjs";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const binaries = {
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  brave: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  edge: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  vivaldi: "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi"
};
const homes = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/",
  gemini: "https://gemini.google.com/",
  perplexity: "https://www.perplexity.ai/",
  notebooklm: "https://notebooklm.google.com/"
};
const args = process.argv.slice(2);
const execFileAsync = promisify(execFile);
const mode = args.shift();
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i].startsWith("--") || !args[i + 1]) throw new Error("Options require --name value");
  options[args[i].slice(2)] = args[i + 1];
}

async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Symlinks are not accepted as build inputs");
    if (entry.isDirectory()) result.push(...(await filesIn(resolve(directory, entry.name))));
    else if (entry.isFile() && entry.name !== ".DS_Store")
      result.push(resolve(directory, entry.name));
  }
  return result.sort();
}

async function ownedProfile(browser, profile) {
  // Never claim an existing nonempty browser profile just because the caller supplied its path.
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const marker = resolve(profile, ".jelluvi-qa-owner.json");
  try {
    const record = JSON.parse(await readFile(marker, "utf8"));
    if (
      record.schemaVersion !== 1 ||
      record.browser !== browser ||
      record.owner !== "jelluvi-live-qa"
    ) {
      throw new Error("QA profile ownership mismatch");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if ((await readdir(profile)).length)
      throw new Error("Refusing an existing nonempty unowned profile");
    await writeFile(
      marker,
      JSON.stringify({ schemaVersion: 1, owner: "jelluvi-live-qa", browser }),
      { flag: "wx", mode: 0o600 }
    );
  }
}

async function installedBytes(context, id, build) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${id}/popup/index.html`);
    const version = await page.evaluate(() => chrome.runtime.getManifest().version);
    if (version !== build.version) throw new Error("Installed runtime version differs from build");
    const resources = [];
    for (const file of await filesIn(resolve(root, "dist"))) {
      const relative = file.slice(resolve(root, "dist").length + 1);
      const bytes = await readFile(file);
      const expected = sha256(bytes);
      const actual = await page.evaluate(async (resource) => {
        const response = await fetch(chrome.runtime.getURL(resource));
        if (!response.ok) throw new Error(`Resource HTTP ${response.status}`);
        return [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()))
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }, relative);
      if (actual !== expected) throw new Error(`Runtime bytes differ: ${relative}`);
      resources.push({ name: relative, sha256: actual, bytes: bytes.length });
    }
    return { version, resourcesVerified: true, resources };
  } finally {
    await page.close();
  }
}

async function wakeGuard() {
  if (process.platform !== "darwin") return null;
  const child = spawn("/usr/bin/caffeinate", ["-dimsu"], { stdio: "ignore" });
  let exited = false;
  const ended = new Promise((done) =>
    child.once("exit", () => {
      exited = true;
      done();
    })
  );
  await new Promise((done, reject) => {
    child.once("spawn", done);
    child.once("error", reject);
  });
  const assertions = await execFileAsync("/usr/bin/pmset", ["-g", "assertions"]);
  if (!assertions.stdout.includes(`pid ${child.pid}(caffeinate)`)) {
    child.kill("SIGTERM");
    await ended;
    throw new Error("Task wake guard is not asserted");
  }
  let closing;
  return {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    close() {
      closing ??= (async () => {
        if (!exited) child.kill("SIGTERM");
        await ended;
      })();
      return closing;
    }
  };
}

export async function savedExport(context, session, id, config, output) {
  if (!LIVE_QA_CONTRACT.automatedExportStages.includes(config.stage))
    throw new Error("Unsupported automated stage");
  if (!homes[config.provider]) throw new Error("Unknown provider");
  const url = new URL(config.url);
  if (url.origin !== new URL(homes[config.provider]).origin || url.username || url.password) {
    throw new Error("Source must be a conversation on the selected provider origin");
  }
  const source = await context.newPage();
  const focusSession = await context.newCDPSession(source);
  await focusSession.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await source.goto(config.url, { waitUntil: "domcontentloaded" });
  await source.bringToFront();
  const { targetInfos } = await session.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const tabs = targetInfos.filter((target) => target.type === "tab" && target.url === source.url());
  if (tabs.length !== 1) throw new Error("Cannot uniquely identify the actual source tab target");
  // Official default-action invocation supplies the genuine activeTab gesture. No permission patch.
  await session.send("Extensions.triggerAction", { id, targetId: tabs[0].targetId });
  const worker =
    context.serviceWorkers().find((item) => item.url().startsWith(`chrome-extension://${id}/`)) ??
    (await context.waitForEvent("serviceworker", {
      predicate: (item) => item.url().startsWith(`chrome-extension://${id}/`)
    }));
  const sourceTabId = await worker.evaluate(async (sourceUrl) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url === sourceUrl)?.id;
  }, config.url);
  if (!Number.isInteger(sourceTabId))
    throw new Error("Default action did not grant access to the intended tab");
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup/index.html?sourceTabId=${sourceTabId}`);
  await popup.getByLabel("Bundle as ZIP").uncheck();
  const formats = popup.getByRole("group", { name: "Export formats" });
  // Select JSON before clearing other formats so the UI never has an empty selection.
  const json = formats.getByRole("button", { name: "JSON", exact: true });
  if ((await json.getAttribute("aria-pressed")) !== "true") await json.click();
  for (const button of await formats.getByRole("button").all()) {
    if (
      (await button.innerText()) !== "JSON" &&
      (await button.getAttribute("aria-pressed")) === "true"
    )
      await button.click();
  }
  const deadline = config.timeoutMs ?? 240000;
  if (!Number.isInteger(deadline) || deadline < 1000 || deadline > 900000)
    throw new Error("Invalid bounded export deadline");
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: output,
    eventsEnabled: true
  });
  let download;
  let resolveDownload;
  let rejectDownload;
  const downloadPromise = new Promise((done, reject) => {
    resolveDownload = done;
    rejectDownload = reject;
  });
  // Observe early failures while UI activation is still pending; the original promise still rejects.
  downloadPromise.catch(() => {});
  const onBegin = (event) => {
    if (download) {
      rejectDownload(new Error("Unexpected additional download"));
      return;
    }
    download = event;
  };
  const onProgress = (event) => {
    if (event.guid !== download?.guid) return;
    if (event.state === "completed") resolveDownload(download);
    if (event.state === "canceled") rejectDownload(new Error("Download was canceled"));
  };
  session.on("Browser.downloadWillBegin", onBegin);
  session.on("Browser.downloadProgress", onProgress);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("No completed export download within the bounded deadline")),
      deadline
    );
  });
  timeout.catch(() => {});
  let background;
  try {
    const jobCreated = context.waitForEvent("page", { timeout: 15000 }).then(
      (page) => ({ page }),
      (error) => ({ error })
    );
    await popup.getByRole("button", { name: "Export", exact: true }).click();
    const job = await jobCreated;
    if (job.error) throw job.error;
    if (config.stage === "background-long") {
      background = await context.newPage();
      await background.goto("about:blank");
      await background.bringToFront();
      if ((await source.evaluate(() => document.visibilityState)) !== "hidden")
        throw new Error("Source is not genuinely backgrounded");
    } else {
      await source.bringToFront();
      if ((await source.evaluate(() => document.visibilityState)) !== "visible")
        throw new Error("Source is not genuinely foregrounded");
    }
    await source.evaluate(() => {
      const states = [document.visibilityState];
      document.addEventListener("visibilitychange", () => states.push(document.visibilityState));
      globalThis.__jelluviQaReadVisibility = () => [...states, document.visibilityState];
    });
    const completed = await Promise.race([downloadPromise, timeout]);
    if (
      basename(completed.suggestedFilename) !== completed.suggestedFilename ||
      !completed.suggestedFilename.endsWith(".json")
    )
      throw new Error("Unexpected export filename");
    const artifact = resolve(output, completed.suggestedFilename);
    const bytes = await readFile(artifact);
    const conversation = JSON.parse(bytes.toString("utf8"));
    const referenceBytes = await readFile(resolve(config.reference));
    const reference = JSON.parse(referenceBytes.toString("utf8"));
    if (reference.sourceUrlSha256 !== sha256(config.url))
      throw new Error("Reference identifies another conversation URL");
    if (conversation.sourceUrl !== config.url)
      throw new Error("Saved export identifies another conversation URL");
    if (conversation.platform !== config.provider)
      throw new Error("Saved export identifies another provider");
    const visibility = {
      states: await source.evaluate(() => globalThis.__jelluviQaReadVisibility())
    };
    if (!verifyVisibility(config.stage, visibility))
      throw new Error("Source visibility changed during the export");
    return {
      artifact: basename(artifact),
      reference: resolve(config.reference),
      referenceSha256: sha256(referenceBytes),
      sourceUrlSha256: sha256(config.url),
      visibility,
      download: { state: "completed", bytes: bytes.length, sha256: sha256(bytes) },
      comparison: compareExport(
        conversation,
        reference,
        {
          state: "completed",
          bytes: bytes.length,
          sha256: sha256(bytes)
        },
        config.stage
      )
    };
  } finally {
    clearTimeout(timer);
    session.off("Browser.downloadWillBegin", onBegin);
    session.off("Browser.downloadProgress", onProgress);
  }
}

async function runWithGuard(guard) {
  const build = await verifyBuildProvenance(root);
  if (mode === "verify") {
    const receipts = [];
    const expectedResources = [];
    for (const file of await filesIn(resolve(root, "dist"))) {
      const bytes = await readFile(file);
      expectedResources.push({
        name: file.slice(resolve(root, "dist").length + 1),
        bytes: bytes.length,
        sha256: sha256(bytes)
      });
    }
    const selected = options.manifest
      ? JSON.parse(await readFile(resolve(options.manifest), "utf8"))
      : (await filesIn(resolve(options.receipts ?? "qa-artifacts/live/runs")))
          .filter((file) => basename(file) === "receipt.json")
          .map((file) => ({ file }));
    if (!Array.isArray(selected))
      throw new Error("Evidence manifest must be an array of receipt paths and hashes");
    for (const entry of selected) {
      const file = resolve(entry.file);
      if (basename(file) !== "receipt.json")
        throw new Error("Selected evidence must name a receipt.json file");
      const receiptBytes = await readFile(file);
      if (options.manifest && sha256(receiptBytes) !== entry.sha256)
        throw new Error("Receipt differs from the selected evidence manifest");
      const receipt = JSON.parse(receiptBytes.toString("utf8"));
      // Never trust a persisted passed/verified flag; reconstruct from retained evidence.
      receipt.verified = false;
      if (receipt.error) {
        receipts.push(receipt);
        continue;
      }
      if (receipt.stage === "installation") {
        receipt.verified = verifyInstallation(
          receipt.installation,
          expectedResources,
          build.version
        );
      } else if (LIVE_QA_CONTRACT.automatedExportStages.includes(receipt.stage)) {
        if (basename(receipt.artifact) !== receipt.artifact)
          throw new Error("Export artifact must be next to its receipt");
        const bytes = await readFile(resolve(dirname(file), receipt.artifact));
        const referenceBytes = await readFile(receipt.reference);
        if (
          sha256(bytes) === receipt.download?.sha256 &&
          bytes.length === receipt.download?.bytes &&
          sha256(referenceBytes) === receipt.referenceSha256
        ) {
          const conversation = JSON.parse(bytes.toString("utf8"));
          const reference = JSON.parse(referenceBytes.toString("utf8"));
          receipt.verified =
            reference.sourceUrlSha256 === receipt.sourceUrlSha256 &&
            sha256(conversation.sourceUrl) === receipt.sourceUrlSha256 &&
            conversation.platform === receipt.provider &&
            verifyVisibility(receipt.stage, receipt.visibility) &&
            compareExport(conversation, reference, receipt.download, receipt.stage).passed;
        }
      }
      receipts.push(receipt);
    }
    const result = validateMatrix(receipts, build);
    if (options.report) {
      const reportFile = resolve(options.report);
      await mkdir(dirname(reportFile), { recursive: true, mode: 0o700 });
      const validatorSha256 = sha256(
        (
          await Promise.all(
            ["live-qa.mjs", "live-qa-contract.mjs", "live-qa-browser.mjs"].map((name) =>
              readFile(resolve(root, "scripts", name))
            )
          )
        )
          .map((bytes) => sha256(bytes))
          .join("\n")
      );
      await writeFile(
        reportFile,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            observedAt: new Date().toISOString(),
            contractSha256,
            validatorSha256,
            build,
            selectedReceipts: await Promise.all(
              selected.map(async (entry) => ({
                file: resolve(entry.file),
                sha256: sha256(await readFile(resolve(entry.file)))
              }))
            ),
            result
          },
          null,
          2
        )}\n`,
        { flag: "wx", mode: 0o600 }
      );
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 2;
    return;
  }
  if (!["doctor", "smoke", "setup", "export"].includes(mode))
    throw new Error("Use doctor, smoke, setup, export or verify");
  const browser = options.browser ?? "chrome";
  if (!binaries[browser]) throw new Error("Unknown browser");
  const executablePath = options.executable ?? binaries[browser];
  await access(executablePath);
  if (mode === "doctor") {
    console.log(JSON.stringify({ browser, executablePath, build }, null, 2));
    return;
  }
  const profile = resolve(options.profile ?? `qa-artifacts/live/profiles/${browser}`);
  await ownedProfile(browser, profile);
  const output = resolve(options.output ?? `qa-artifacts/live/runs/${browser}-${Date.now()}`);
  await mkdir(output, { recursive: true, mode: 0o700 });
  if ((await readdir(output)).length)
    throw new Error("Refusing to overwrite a nonempty evidence directory");
  const receipt = {
    schemaVersion: 1,
    contractSha256,
    browser,
    build,
    observedAt: new Date().toISOString(),
    profile,
    provider: "all",
    stage: "installation",
    verified: false,
    cleanup: "not_closed"
  };
  let context;
  let ownedBrowser;
  let activeInput;
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    activeInput?.close();
    void ownedBrowser?.close().catch(() => {});
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    ownedBrowser = await launchQaBrowser(executablePath, profile, options.headless === "true");
    context = ownedBrowser.context;
    receipt.process = ownedBrowser.owner;
    if (interrupted) throw new Error("Interrupted during browser launch");
    const session = ownedBrowser.protocol;
    receipt.browserVersion = (await session.send("Browser.getVersion")).product;
    const { id } = await session.send("Extensions.loadUnpacked", { path: resolve(root, "dist") });
    receipt.installation = await installedBytes(context, id, build);
    receipt.verified = true;
    if (mode === "setup") {
      if (options.provider && !homes[options.provider]) throw new Error("Unknown provider");
      for (const url of options.provider ? [homes[options.provider]] : Object.values(homes))
        await (await context.newPage()).goto(url, { waitUntil: "domcontentloaded" });
      console.log(
        `Dedicated ${browser} QA profile is open. Sign in locally; no session data will be copied. Press Enter here when done.`
      );
      const input = createInterface({ input: process.stdin, output: process.stdout });
      activeInput = input;
      try {
        await input.question("");
      } finally {
        input.close();
      }
    } else if (mode === "export") {
      const configBytes = await readFile(resolve(options.config));
      const config = JSON.parse(configBytes.toString("utf8"));
      receipt.configSha256 = sha256(configBytes);
      receipt.provider = config.provider;
      receipt.stage = config.stage;
      receipt.verified = false;
      Object.assign(receipt, await savedExport(context, session, id, config, output));
      receipt.verified = receipt.comparison.passed;
    }
    if (interrupted) throw new Error("Interrupted by user");
  } catch (error) {
    receipt.error = error.message;
    if (error.resource) {
      receipt.process = error.resource.owner;
      receipt.cleanup = error.resource.cleanup;
    }
    receipt.verified = false;
    process.exitCode = 1;
  } finally {
    try {
      if (ownedBrowser) {
        receipt.cleanup = await ownedBrowser.close();
      } else if (receipt.cleanup === "not_closed") receipt.cleanup = "no_session_created";
    } catch (error) {
      receipt.cleanup = "closure_unverified";
      receipt.cleanupError = error.message;
      receipt.cleanupErrorStack = error.stack;
    } finally {
      if (guard) {
        receipt.wakeGuard = {
          pid: guard.pid,
          startedAt: guard.startedAt,
          cleanup: "closure_unverified"
        };
        try {
          await guard.close();
          receipt.wakeGuard.cleanup = "closed_verified";
        } catch (error) {
          receipt.wakeGuard.error = error.message;
          receipt.wakeGuard.errorStack = error.stack;
        }
      }
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
    await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600
    });
    console.log(
      JSON.stringify(
        {
          ...receipt,
          installation: receipt.installation
            ? {
                version: receipt.installation.version,
                resourcesVerified: receipt.installation.resourcesVerified,
                resourceCount: receipt.installation.resources.length
              }
            : undefined,
          receiptFile: resolve(output, "receipt.json")
        },
        null,
        2
      )
    );
    if (
      !receipt.verified ||
      receipt.cleanup !== "closed_verified" ||
      receipt.wakeGuard?.cleanup === "closure_unverified"
    )
      process.exitCode = 1;
  }
}

async function run() {
  let guard;
  try {
    if (["smoke", "setup", "export"].includes(mode)) guard = await wakeGuard();
    await runWithGuard(guard);
  } finally {
    await guard?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
