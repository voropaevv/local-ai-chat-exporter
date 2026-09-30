import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { PROVIDER_IDS } from "../../../src/core/provider-catalog";

const execFileAsync = promisify(execFile);
const helperPath = resolve(import.meta.dirname, "../../../scripts/live-qa-contract.mjs");
const setup = `
  import { LIVE_QA_CONTRACT, contractSha256, conversationFingerprint, compareExport, validateMatrix, verifyInstallation, verifyVisibility } from ${JSON.stringify(helperPath)};
  const conversation = {schemaVersion: "1.0", platform: "chatgpt", messageCount: 2, completeness: {status: "complete"},
    messages: [{index: 0, role: "user", text: "First"}, {index: 1, role: "assistant", text: "Second"}]};
  const reference = {schemaVersion: 1, origin: "independent-source", sourceDescription: "Controlled independent test source",
    reviewedAt: "2026-09-30", platform: "chatgpt", messages: structuredClone(conversation.messages), ...conversationFingerprint(conversation)};
  const download = {state: "completed", bytes: 200, sha256: "a".repeat(64)};
  const build = {version: "0.2.14", distSha256: "a".repeat(64), sourceSha256: "b".repeat(64)};
  const receipts = LIVE_QA_CONTRACT.browsers.flatMap(browser => LIVE_QA_CONTRACT.providers.flatMap(provider =>
    LIVE_QA_CONTRACT.stages.map(stage => ({schemaVersion:1,browser, provider, stage, build, contractSha256, verified: true, cleanup: "closed_verified"}))));
`;

async function evaluate(source: string) {
  const result = await execFileAsync(process.execPath, [
    "--input-type=module",
    "--eval",
    `${setup}\n${source}`
  ]);
  return JSON.parse(result.stdout);
}

describe("live QA fail-closed contract", () => {
  test("covers every shipped provider", async () => {
    expect(await evaluate("console.log(JSON.stringify(LIVE_QA_CONTRACT.providers))")).toEqual([
      ...PROVIDER_IDS
    ]);
  });
  test("foreground/background coverage requires a consistent visibility trace", async () => {
    const result = await evaluate(`
      console.log(JSON.stringify([
        verifyVisibility('cold-long',{states:['visible','visible']}),
        verifyVisibility('background-long',{states:['hidden','hidden']}),
        verifyVisibility('background-long',{states:['hidden','visible','hidden']}),
        verifyVisibility('cold-long',{states:['hidden','hidden']}),
        verifyVisibility('cold-long',null)
      ]));
    `);
    expect(result).toEqual([true, true, false, false, false]);
  });
  test("does not trust an installation success flag without resource evidence", async () => {
    expect(
      await evaluate(
        `console.log(JSON.stringify(verifyInstallation({version:'0.2.14',resourcesVerified:true},[{name:'manifest.json',bytes:1,sha256:'a'}],'0.2.14')))`
      )
    ).toBe(false);
  });

  test("checks exact resource bytes, names and duplicates", async () => {
    const result = await evaluate(`
      const resources=[{name:'manifest.json',bytes:1,sha256:'a'},{name:'content.js',bytes:2,sha256:'b'}];
      const cases=[resources,[{...resources[0],sha256:'old'},resources[1]],[resources[0],resources[0]]];
      console.log(JSON.stringify(cases.map(items=>verifyInstallation({version:'0.2.14',resources:items},resources,'0.2.14'))));
    `);
    expect(result).toEqual([true, false, false]);
  });

  test("a short smoke cannot count as long/background acceptance", async () => {
    expect(
      (
        await evaluate(
          "console.log(JSON.stringify(compareExport(conversation,reference,download,'background-long')))"
        )
      ).passed
    ).toBe(false);
  });
  test("accepts independently reviewed ordered content and a completed download", async () => {
    expect(
      (
        await evaluate(
          "console.log(JSON.stringify(compareExport(conversation,reference,download)))"
        )
      ).passed
    ).toBe(true);
  });

  test.each([
    ["truncated", "conversation.messages.pop(); conversation.messageCount=1;"],
    [
      "reordered",
      "conversation.messages.reverse(); conversation.messages.forEach((m,i)=>m.index=i);"
    ],
    ["changed text at identical count", "conversation.messages[1].text='Different';"],
    ["candidate blessing itself", "reference.origin='candidate-export';"],
    ["missing reference", "reference.origin=undefined;"],
    ["hash-only reference without retained source", "delete reference.messages;"],
    [
      "reference text changed behind unchanged fingerprint",
      "reference.messages[1].text='Changed';"
    ],
    ["download requested but incomplete", "download.state='requested';"],
    ["partial coverage", "conversation.completeness.status='partial';"]
  ])("rejects %s", async (_, mutation) => {
    expect(
      (
        await evaluate(
          `${mutation}\nconsole.log(JSON.stringify(compareExport(conversation,reference,download)))`
        )
      ).passed
    ).toBe(false);
  });

  test("rejects contradictory counts and non-sequential indexes", async () => {
    const result = await evaluate(`
      const errors=[];
      for (const mutation of [()=>conversation.messageCount=3, ()=>{conversation.messageCount=2;conversation.messages[1].index=5}]) {
        mutation();try {conversationFingerprint(conversation)} catch(error) {errors.push(error.message)}
      }
      console.log(JSON.stringify(errors));
    `);
    expect(result).toHaveLength(2);
  });

  test("requires all 140 browser/provider/stage cells", async () => {
    const result = await evaluate("console.log(JSON.stringify(validateMatrix(receipts,build)))");
    expect(result).toMatchObject({ ready: true, verified: 140, required: 140 });
  });

  test.each([
    ["missing row", "receipts.pop();"],
    ["duplicate row", "receipts.push(receipts[0]);"],
    ["stale candidate", "receipts[0]={...receipts[0],build:{...build,distSha256:'old'}};"],
    ["changed source", "receipts[0]={...receipts[0],build:{...build,sourceSha256:'old'}};"],
    ["stale contract", "receipts[0]={...receipts[0],contractSha256:'old'};"],
    ["cleanup only attempted", "receipts[0]={...receipts[0],cleanup:'close_requested'};"],
    ["interrupted row pretending success", "receipts[0]={...receipts[0],error:'Interrupted'};"],
    [
      "wake guard cleanup unverified",
      "receipts[0]={...receipts[0],wakeGuard:{cleanup:'closure_unverified'}};"
    ],
    ["unknown browser", "receipts[0]={...receipts[0],browser:'unknown'};"]
  ])("matrix rejects %s", async (_, mutation) => {
    expect(
      (await evaluate(`${mutation}\nconsole.log(JSON.stringify(validateMatrix(receipts,build)))`))
        .ready
    ).toBe(false);
  });

  test("installation is shared without completing provider stages", async () => {
    const result = await evaluate(`
      console.log(JSON.stringify(validateMatrix([{...receipts[0],provider:'all',stage:'installation'}],build)));
    `);
    expect(result).toMatchObject({ ready: false, verified: 5 });
    expect(result.missing).toHaveLength(135);
  });
});
