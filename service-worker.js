const CACHE='mon-budget-v24-7-6-audit-fixes';
const CORE=['./','./index.html','./style.css?v=24.7.6','./app.js?v=24.7.6','./config.js?v=24.7.6','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mon-budget-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const corePaths=new Set(CORE.map(path=>new URL(path,scope).pathname));
  if(request.mode!=='navigate'&&!corePaths.has(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(response.ok){try{await cache.put(request,response.clone())}catch(error){}}
      return response;
    }catch(error){
      const cached=await cache.match(request);
      if(cached)return cached;
      if(request.mode==='navigate'){
        const index=await cache.match(new URL('./index.html',scope).href);
        if(index)return index;
      }
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'./';

  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
      for(const client of windows){
        if('focus' in client){
          client.focus();
          return client;
        }
      }
      if(clients.openWindow)return clients.openWindow(target);
    })
  );
});
