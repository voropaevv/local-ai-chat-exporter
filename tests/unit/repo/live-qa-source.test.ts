import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("live Notebook QA accepts official aliases without broadening source access", async () => {
  const helper = resolve(import.meta.dirname, "../../../scripts/live-qa.mjs");
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module",
    "--eval",
    `
    import {savedExport} from ${JSON.stringify(helper)};
    const results=[];
    for(const url of [
      'https://notebook.google.com/notebook/test',
      'https://notebooklm.google.com/notebook/test',
      'https://notebook.google.com.evil.example/notebook/test',
      'http://notebook.google.com/notebook/test',
      'https://user:password@notebook.google.com/notebook/test',
      'https://gemini.google.com/app/test'
    ]) {
      try { await savedExport({pages:()=>[]},{send:async()=>{throw Error('accepted-source')}},
        'ext',{provider:'notebooklm',stage:'cold-short',url},'/unused'); }
      catch(error){results.push(error.message)}
    }
    console.log(JSON.stringify(results));
  `
  ]);
  expect(JSON.parse(stdout)).toEqual([
    "accepted-source",
    "accepted-source",
    ...Array(4).fill("Source must be a conversation on the selected provider origin")
  ]);
});

test("live export binds the newly created tab and refuses redirected or ambiguous sources", async () => {
  const helper = resolve(import.meta.dirname, "../../../scripts/live-qa.mjs");
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module",
    "--eval",
    `
    import {savedExport} from ${JSON.stringify(helper)};
    const expected='https://chatgpt.com/c/test';
    const results=[];
    for (const mode of ['duplicate','redirect','ambiguous','cleanup-failure','challenge']) {
      const calls=[]; let queries=0; let loaded=false; let closed=false; let ready=false;
      const retained={isClosed:()=>false,close:async()=>{throw Error('borrowed page closed')}};
      const pages=[retained];
      const target=(id)=>({type:'tab',targetId:id,url:expected});
      const session={send:async(name,args)=>{
        if(name==='Target.getTargets') return {targetInfos:queries++===0
          ? [target('old')] : [target('old'),target('new'),...(mode==='ambiguous'?[target('other')]:[])]};
        if(name==='Extensions.triggerAction') {if(!ready)throw Error('export-before-provider-ready');calls.push(args.targetId)};
        return {};
      }};
      const source={goto:async()=>{},waitForLoadState:async()=>{loaded=true},
        waitForFunction:async(fn,arg,options)=>{
          if(options.timeout!==30000)throw Error('unbounded readiness');
          globalThis.document={title:'Just a moment...'};
          if(fn()!==false)throw Error('challenge accepted');
          if(mode==='challenge')throw Error('provider readiness timeout');
          globalThis.document={title:'Claude'};
          if(fn()!==true)throw Error('ready source rejected');ready=true;
        },
        url:()=>mode==='redirect'?'https://chatgpt.com/':expected,bringToFront:async()=>{},
        isClosed:()=>closed,close:async()=>{closed=true;if(mode==='cleanup-failure')throw Error('close rejected')}};
      const context={pages:()=>pages,newPage:async()=>{pages.push(source);return source},newCDPSession:async()=>({send:async()=>{}}),
        serviceWorkers:()=>[{url:()=> 'chrome-extension://ext/worker.js',evaluate:async()=>{throw Error('selected')}}]};
      try {await savedExport(context,session,'ext',{provider:'chatgpt',stage:'cold-short',url:expected},'/unused')}
      catch(error){results.push({mode,calls,loaded,closed,error:error.message,...(mode==='cleanup-failure'?{cleanupErrors:error.tabCleanupErrors}:{})})}
    }
    console.log(JSON.stringify(results));
  `
  ]);
  const results = JSON.parse(stdout);
  expect(results[0]).toEqual({
    mode: "duplicate",
    calls: ["new"],
    loaded: true,
    closed: true,
    error: "selected"
  });
  expect(results[1].calls).toEqual([]);
  expect(results.every((result: { closed: boolean }) => result.closed)).toBe(true);
  expect(results[1].error).toContain("Source redirected before export");
  expect(results[2].calls).toEqual([]);
  expect(results[2].error).toBe("Cannot uniquely identify the actual source tab target");
  expect(results[3].error).toBe("selected");
  expect(results[3].cleanupErrors).toEqual(["close rejected"]);
  expect(results[4].calls).toEqual([]);
  expect(results[4].error).toBe("provider readiness timeout");
});
