const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const handlers={},deleted=[],puts=[];let network=()=>Promise.reject(new Error('offline'));const cached=new Map();
const scope='https://example.test/budget/';const index=new Response('<html>offline</html>',{headers:{'Content-Type':'text/html'}});cached.set(scope+'index.html',index);
const cache={match:async r=>cached.get(typeof r==='string'?r:r.url),put:async(r)=>puts.push(r.url)};
const self={registration:{scope},clients:{claim:async()=>{}},addEventListener:(n,f)=>handlers[n]=f};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),{self,URL,Response,fetch:r=>network(r),caches:{open:async()=>cache,keys:async()=>['other-app','mon-budget-old'],delete:async k=>deleted.push(k)},console});
function event(url,mode='cors'){let promise;handlers.fetch({request:{url,method:'GET',mode},respondWith:p=>promise=p});return promise}
(async()=>{
 let p;handlers.activate({waitUntil:x=>p=x});await p;assert.deepEqual(deleted,['mon-budget-old']);
 assert.equal(event('https://api.example.test/user'),undefined);
 assert.equal(event('https://example.test/other/app.js'),undefined);
 assert.equal((await event(scope+'app.js?v=24.7.6')).type,'error');
 assert.equal(await (await event(scope+'route','navigate')).text(),'<html>offline</html>');
 network=async()=>new Response('server error',{status:500});await event(scope+'app.js?v=24.7.6');assert.equal(puts.length,0);
 network=async()=>new Response('OK');await event(scope+'app.js?v=24.7.6');assert.equal(puts.length,1);
 console.log('PASS 7 contrôles du service worker : isolation, navigation, cache, erreurs');
})().catch(e=>{console.error(e);process.exitCode=1});
