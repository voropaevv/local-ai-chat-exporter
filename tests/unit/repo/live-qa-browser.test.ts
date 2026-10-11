import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const helperPath = resolve(import.meta.dirname, "../../../scripts/live-qa-browser.mjs");

async function evaluate(source: string) {
  const result = await execFileAsync(process.execPath, [
    "--input-type=module",
    "--eval",
    `
    import { PassThrough } from 'node:stream';
    import { createPipeProtocol } from ${JSON.stringify(helperPath)};
    const input=new PassThrough();const output=new PassThrough();
    const protocol=createPipeProtocol(input,output);
    ${source}
    protocol.close();
  `
  ]);
  return JSON.parse(result.stdout);
}

describe("owned live browser pipe", () => {
  test("bounds stalled setup operations and preserves success and original failure", async () => {
    const result = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `
      import {withDeadline} from ${JSON.stringify(helperPath)};
      console.log(JSON.stringify([
        await withDeadline(new Promise(()=>{}),'Stalled page',5).catch(e=>e.message),
        await withDeadline(Promise.resolve('ready'),'Ready page',1000),
        await withDeadline(Promise.reject(new Error('original')),'Failed page',1000).catch(e=>e.message)
      ]));
    `
    ]);
    expect(JSON.parse(result.stdout)).toEqual([
      "Stalled page: deadline exceeded",
      "ready",
      "original"
    ]);
  });
  test("permission failure requires a valid independent process-group inventory", async () => {
    const result = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `
      import {processGroupAlive} from ${JSON.stringify(helperPath)};
      const denied=()=>{throw Object.assign(new Error('denied'),{code:'EPERM'})};
      const check=(inventory)=>{try{return processGroupAlive(123,denied,inventory)}catch{return 'blocked'}};
      console.log(JSON.stringify([
        check(()=> '1 1\n42 42\n'), check(()=> '1 1\n456 123\n'),
        check(()=> ''), check(()=> 'invalid'), check(()=>{throw new Error('ps failed')}),
        processGroupAlive(123,()=>{},()=>{throw new Error('must not read')}),
        processGroupAlive(123,()=>{throw Object.assign(new Error(),{code:'ESRCH'})})
      ]));
    `
        .replaceAll("'1 1\n42 42\n'", "'1 1\\n42 42\\n'")
        .replaceAll("'1 1\n456 123\n'", "'1 1\\n456 123\\n'")
    ]);
    expect(JSON.parse(result.stdout)).toEqual([
      false,
      true,
      "blocked",
      "blocked",
      "blocked",
      true,
      false
    ]);
  });
  test("a failed browser startup retains actual process-close evidence", async () => {
    const result = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `
      import {launchQaBrowser} from ${JSON.stringify(helperPath)};
      import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
      const profile=await mkdtemp(join(tmpdir(),'jelluvi-failed-start-test-'));
      try {
        try {await launchQaBrowser(process.execPath,profile,true)} catch(error) {
          let alive=true;try{process.kill(error.resource.owner.pid,0)}catch{alive=false}
          console.log(JSON.stringify({cleanup:error.resource.cleanup,alive}));
        }
      } finally {await rm(profile,{recursive:true,force:true})}
    `
    ]);
    expect(JSON.parse(result.stdout)).toEqual({ cleanup: "closed_verified", alive: false });
  }, 10000);
  test("matches fragmented NUL-delimited responses and dispatches download events", async () => {
    const result = await evaluate(
      `
      let event;
      protocol.on('Browser.downloadProgress', value=>event=value);
      const result=protocol.send('Browser.getVersion');
      output.write('{"id":1,"res');
      output.write('ult":{"product":"Chrome/test"}}\0{"method":"Browser.downloadProgress","params":{"state":"completed"}}\0');
      console.log(JSON.stringify({result:await result,event}));
    `.replaceAll("\0", "\\0")
    );
    expect(result).toEqual({ result: { product: "Chrome/test" }, event: { state: "completed" } });
  });

  test.each([
    [
      "protocol error",
      "output.write(JSON.stringify({id:1,error:{message:'Method not available'}})+'\\0');"
    ],
    ["malformed frame", "output.write('bad-json\\0');"],
    ["disconnect", "output.end();"]
  ])("rejects pending requests on %s", async (_, operation) => {
    const result = await evaluate(`
      const pending=protocol.send('Extensions.loadUnpacked').then(()=>false,()=>true);
      ${operation}
      console.log(JSON.stringify(await pending));
    `);
    expect(result).toBe(true);
  });

  test("bounds a request that receives no response", async () => {
    expect(
      await evaluate(
        `console.log(JSON.stringify(await protocol.send('NoResponse',{},5).then(()=>false,()=>true)));`
      )
    ).toBe(true);
  });
});
