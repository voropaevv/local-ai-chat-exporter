#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = resolve(projectRoot, "tests/fixtures");
const contractPath = resolve(fixtureRoot, "provider-contracts.json");
const reportPath = resolve(projectRoot, "qa-artifacts/provider-drift-report.json");
const writeReport = process.argv.includes("--report");
const MAX_FIXTURE_BYTES = 128 * 1024;
const SANITIZED_MARKER = "jelluvi-fixture: sanitized synthetic DOM";

async function main() {
  const manifest = JSON.parse(await readFile(contractPath, "utf8"));
  const results = [];

  for (const contract of manifest.contracts ?? []) {
    results.push(await checkContract(contract));
  }

  const report = {
    checkedAt: new Date().toISOString(),
    contractCount: results.length,
    passed: results.every((result) => result.violations.length === 0),
    results,
    schemaVersion: 1
  };

  if (writeReport) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  const violations = results.flatMap((result) =>
    result.violations.map((violation) => `${result.provider}: ${violation}`)
  );

  if (violations.length > 0) {
    violations.forEach((violation) => console.error(violation));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Provider drift contracts passed for ${results.map((result) => result.provider).join(", ")}.`
  );
}

async function checkContract(contract) {
  const violations = [];
  const fixturePath = resolve(fixtureRoot, contract.fixture ?? "");
  const fixture = await readFile(fixturePath, "utf8").catch(() => undefined);

  if (fixture === undefined) {
    return {
      fixture: contract.fixture,
      messageCount: 0,
      provider: contract.provider ?? "unknown",
      violations: ["fixture is missing"]
    };
  }

  if (!fixture.includes(SANITIZED_MARKER)) {
    violations.push("fixture is not marked as sanitized synthetic DOM");
  }

  if (Buffer.byteLength(fixture, "utf8") > MAX_FIXTURE_BYTES) {
    violations.push(`fixture exceeds ${MAX_FIXTURE_BYTES} bytes`);
  }

  violations.push(...findUnsafeFixturePatterns(fixture));

  let messageCount = 0;

  try {
    const document = new JSDOM(fixture, {
      url: `https://${contract.hostname ?? "example.invalid"}/fixture`
    }).window.document;

    messageCount = document.querySelectorAll(contract.messageSelector).length;

    if (messageCount < contract.minimumMessages) {
      violations.push(
        `message selector matched ${messageCount}; expected at least ${contract.minimumMessages}`
      );
    }

    if (contract.contentSelector && document.querySelector(contract.contentSelector) === null) {
      violations.push("content selector matched no elements");
    }
  } catch (error) {
    violations.push(error instanceof Error ? error.message : "selector contract could not run");
  }

  return {
    fixture: contract.fixture,
    messageCount,
    provider: contract.provider ?? "unknown",
    violations
  };
}

function findUnsafeFixturePatterns(source) {
  const checks = [
    [/<script\b/iu, "script tag"],
    [/<(?:iframe|object|embed|form)\b/iu, "active or embedded content"],
    [/\son[a-z]+\s*=/iu, "inline event handler"],
    [/\bdata:image\//iu, "embedded image payload"],
    [/\b(?:bearer|api[_-]?key|authorization)\b/iu, "credential marker"],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu, "email address"],
    [/(?:src|action)\s*=\s*["']https?:\/\//iu, "remote resource URL"]
  ];

  return checks.flatMap(([pattern, label]) => (pattern.test(source) ? [label] : []));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
