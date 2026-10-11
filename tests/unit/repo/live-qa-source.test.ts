import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("live export binds the newly created tab and refuses redirected or ambiguous sources", async () => {
  const helper = resolve(import.meta.dirname, "../../../scripts/live-qa.mjs");
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module",
    "--eval",
    `
    import {savedExport} from ${JSON.stringify(helper)};
    const expected='https://chatgpt.com/c/test';
    const results=[];
    for (const mode of ['duplicate','redirect','ambiguous']) {
      const calls=[]; let queries=0; let loaded=false;
      const target=(id)=>({type:'tab',targetId:id,url:expected});
      const session={send:async(name,args)=>{
        if(name==='Target.getTargets') return {targetInfos:queries++===0
          ? [target('old')] : [target('old'),target('new'),...(mode==='ambiguous'?[target('other')]:[])]};
        if(name==='Extensions.triggerAction') calls.push(args.targetId);
        return {};
      }};
      const source={goto:async()=>{},waitForLoadState:async()=>{loaded=true},
        url:()=>mode==='redirect'?'https://chatgpt.com/':expected,bringToFront:async()=>{}};
      const context={newPage:async()=>source,newCDPSession:async()=>({send:async()=>{}}),
        serviceWorkers:()=>[{url:()=> 'chrome-extension://ext/worker.js',evaluate:async()=>{throw Error('selected')}}]};
      try {await savedExport(context,session,'ext',{provider:'chatgpt',stage:'cold-short',url:expected},'/unused')}
      catch(error){results.push({mode,calls,loaded,error:error.message})}
    }
    console.log(JSON.stringify(results));
  `
  ]);
  const results = JSON.parse(stdout);
  expect(results[0]).toEqual({
    mode: "duplicate",
    calls: ["new"],
    loaded: true,
    error: "selected"
  });
  expect(results[1].calls).toEqual([]);
  expect(results[1].error).toContain("Source redirected before export");
  expect(results[2].calls).toEqual([]);
  expect(results[2].error).toBe("Cannot uniquely identify the actual source tab target");
});
