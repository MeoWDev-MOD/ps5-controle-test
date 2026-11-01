// Cache simples para o app abrir offline. Aumente a versão ao publicar mudanças.
const CACHE = "ps5-teste-web-v2";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "ds/ds_cap_l3.png", "ds/ds_cap_r3.png", "ds/ds_circle.png", "ds/ds_create.png", "ds/ds_cross.png", "ds/ds_dpad_down.png", "ds/ds_dpad_left.png", "ds/ds_dpad_right.png", "ds/ds_dpad_up.png", "ds/ds_idle.png", "ds/ds_l1.png", "ds/ds_l2.png", "ds/ds_l3.png", "ds/ds_mute.png", "ds/ds_options.png", "ds/ds_ps.png", "ds/ds_r1.png", "ds/ds_r2.png", "ds/ds_r3.png", "ds/ds_square.png", "ds/ds_touchpad.png", "ds/ds_triangle.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// rede primeiro (pega versão nova), cache se estiver sem internet
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
