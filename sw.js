/* Neural Art V22.5 — isolated local shell cache.
   External Three.js and hand libraries still require Internet access. */
'use strict';
const PREFIX='neural-art-';
const CACHE=PREFIX+'v22-5-isolated-shell';
const SCOPE=new URL(self.registration.scope);
const INDEX=new URL('./index.html',SCOPE).href;
const LOCAL_ASSETS=['./','./index.html','./neural-v20.js?v=22.4','./performance-v21.js?v=22.1','./strings-v22.js?v=22.2','./manifest.json','./icon.svg'].map(p=>new URL(p,SCOPE).href);
const ALLOWED=new Set(LOCAL_ASSETS);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(LOCAL_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname)||!ALLOWED.has(url.href))return;
  event.respondWith((async()=>{
    let cache;
    try{
      const response=await fetch(request);
      if(response.ok&&!response.redirected){
        try{cache=await caches.open(CACHE);await cache.put(request,response.clone());}catch(_){}
      }
      return response;
    }catch(_){
      try{
        cache=cache||await caches.open(CACHE);
        const cached=await cache.match(request);
        if(cached)return cached;
        if(request.mode==='navigate')return await cache.match(INDEX)||Response.error();
      }catch(_){}
      return Response.error();
    }
  })());
});
