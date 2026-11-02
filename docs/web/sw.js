// Cache simples para o app abrir offline. Aumente a versão ao publicar mudanças.
const CACHE = "ps5-teste-web-v15";
const SPRITES = ["cap_l3", "cap_r3", "circle", "create", "cross", "dpad_down", "dpad_left", "dpad_right", "dpad_up", "idle", "l1", "l2", "l3", "mute", "options", "ps", "r1", "r2", "r3", "square", "touchpad", "triangle"];
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "logo.png", "logo-xl.webp", "js/app.js", "js/protocol.js", "js/i18n.js", "js/ui.js", "js/history.js", "js/pix.js", "js/banners.js", "js/shader.js", "js/pagefx.js", "vendor/gsap.min.js", "pix-qr.svg", "ds4/ds4.svg", "licencas/dualshock-tools-MIT.txt", ...SPRITES.map((n) => "ds/ds_" + n + ".png")];

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
  // banners e outros arquivos de fora ficam com o navegador: não entram no cache offline
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
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
