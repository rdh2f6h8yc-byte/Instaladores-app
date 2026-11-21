const CACHE="borna-v5";
const ARCHIVOS=["/","/index.html","/config.js","/comun.js","/nube.js","/push.js","/pdf.js","/manifest.json","/icon-192.png","/icon-512.png","/apple-touch-icon.png","/planos/","/clientes/","/contactos/","/estadisticas/","/material/","/p/","/c/","/privacidad/","/base.css"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARCHIVOS)).catch(()=>{}));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
// Solo archivos de la propia web: primero la red (para recibir actualizaciones) y sin cobertura la copia guardada.
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(k=>k.put(e.request,c));return r})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("/"))));
});

// Notificaciones
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){d={title:"Aviso",body:e.data?e.data.text():""}}
  e.waitUntil(self.registration.showNotification(d.title||"Aviso",{body:d.body||"",icon:"/icon-192.png",badge:"/icon-192.png",tag:d.tag?d.tag+"-"+Date.now():undefined,data:{url:d.url||"/"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||"/",self.location.origin).href;
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{for(const w of ws){if("focus" in w){if(w.navigate)w.navigate(url);return w.focus()}}return clients.openWindow(url)}))});
