const CACHE='ciclo-v6.0.0';
const ASSETS=['./','./index.html','./app.js','./model.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>/^ciclo-v/.test(key)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const response=fetch(event.request).then(async result=>{
    if(result.ok){const cache=await caches.open(CACHE);try{await cache.put(event.request,result.clone());}catch{}}
    return result;
  }).catch(async()=>await caches.match(event.request)||(event.request.mode==='navigate'?await caches.match('./index.html'):null)||Response.error());
  event.respondWith(response);
});
