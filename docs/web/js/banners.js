// Banners de publicidade: vêm do CRM (rota pública /api/banners). Se o CRM falhar, o site só fica sem banner.
"use strict";

export const BANNERS_URL = "https://crm-pessoal-chi.vercel.app/api/banners";
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
const fromSupabase = (u) => { try { return new URL(u).hostname.endsWith(".supabase.co"); } catch { return false; } };

// Só aceita o que o CRM deve mandar: arquivo no Supabase e link https.
export function cleanBanners(json) {
  if (!Array.isArray(json?.banners)) return [];
  return json.banners
    .filter((b) => b && typeof b.media_url === "string" && isHttps(b.media_url) && fromSupabase(b.media_url) && (b.kind === "image" || b.kind === "video"))
    .map((b) => ({ id: String(b.id), title: String(b.title ?? ""), media: b.media_url, kind: b.kind, link: typeof b.link_url === "string" && isHttps(b.link_url) ? b.link_url : null }));
}

// `local`: lugar cadastrado no CRM (aba Publicidade). Cada lugar recebe só os anúncios marcados para ele.
export const bannersUrl = (local) => `${BANNERS_URL}?local=${encodeURIComponent(local)}`;

export async function fetchBanners(local, ms = 5000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(bannersUrl(local), { signal: c.signal });
    return r.ok ? cleanBanners(await r.json()) : [];
  } catch { return []; } finally { clearTimeout(t); }
}

// Liga um espaço de publicidade: busca, mostra, troca a cada 20 s e atualiza a cada 10 min.
// Sem banner, o espaço (slot) fica escondido. Usado no painel e na página inicial.
export function mountAds(slot, box, local) {
  let ads = [], i = 0, shown = null, rotate = 0;
  function show() {
    const b = ads[i % ads.length];
    if (!b) { slot.classList.add("hidden"); shown = null; return; }
    slot.classList.remove("hidden");
    if (shown === b.media) return;
    shown = b.media;
    const m = document.createElement(b.kind === "video" ? "video" : "img");
    m.src = b.media;
    if (b.kind === "video") {
      m.muted = true; m.loop = true; m.playsInline = true; m.setAttribute("aria-label", b.title);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) m.autoplay = true;
    } else m.alt = b.title;
    m.onerror = () => { ads = ads.filter((x) => x !== b); shown = null; show(); };
    let node = m;
    if (b.link) { const a = document.createElement("a"); a.href = b.link; a.target = "_blank"; a.rel = "noopener sponsored"; a.append(m); node = a; }
    box.replaceChildren(node);
  }
  async function load() {
    ads = await fetchBanners(local);
    i = 0; shown = null;
    show();
    clearInterval(rotate);
    if (ads.length > 1) rotate = setInterval(() => { i++; show(); }, 20000);
  }
  load();
  setInterval(load, 600000);
}
