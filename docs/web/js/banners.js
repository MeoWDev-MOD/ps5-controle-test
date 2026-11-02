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

// Cada visita começa pelo anúncio seguinte ao último que esta pessoa viu. Sem histórico (ou se ele saiu do ar), sorteia,
// para os anúncios dividirem as visitas novas.
export function firstIndex(ads, lastId, random = Math.random) {
  if (!ads.length) return 0;
  const at = ads.findIndex((a) => a.id === lastId);
  return at < 0 ? Math.floor(random() * ads.length) : (at + 1) % ads.length;
}

// O histórico fica só no navegador; sem armazenamento, os anúncios apenas não alternam entre visitas.
const readLast = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const saveLast = (key, id) => { try { localStorage.setItem(key, id); } catch { /* segue sem histórico */ } };

// Desenha um anúncio em um espaço. Sem anúncio, o espaço fica escondido. Repetir o mesmo anúncio não recomeça o vídeo.
function slotView(slot, box, onFail) {
  let shown = null;
  return (b) => {
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
    m.onerror = () => { shown = null; onFail(b); };
    let node = m;
    if (b.link) { const a = document.createElement("a"); a.href = b.link; a.target = "_blank"; a.rel = "noopener sponsored"; a.append(m); node = a; }
    box.replaceChildren(node);
  };
}

// Liga um ou mais espaços ao mesmo lugar do CRM: busca, mostra, troca a cada 20 s e atualiza a cada 10 min.
// Com dois espaços, o segundo mostra o anúncio seguinte ao do primeiro.
function runAds(pairs, local) {
  const key = `ps5-ad-${local}`;
  let ads = [], i = 0, rotate = 0;
  const views = pairs.map(([slot, box]) => slotView(slot, box, (b) => { ads = ads.filter((x) => x !== b); show(); }));
  function show() {
    views.forEach((view, n) => view(ads.length ? ads[(i + n) % ads.length] : null));
    if (ads.length) saveLast(key, ads[i % ads.length].id);
  }
  async function load() {
    const current = ads.length ? ads[i % ads.length].id : null;
    ads = await fetchBanners(local);
    const keep = ads.findIndex((a) => a.id === current);
    i = keep >= 0 ? keep : firstIndex(ads, readLast(key));
    show();
    clearInterval(rotate);
    if (ads.length > 1) rotate = setInterval(() => { i++; show(); }, 20000);
  }
  load();
  setInterval(load, 600000);
}

export const mountAds = (slot, box, local) => runAds([[slot, box]], local);

// Anúncios verticais nas laterais: só em tela larga o bastante, e só baixa o arquivo quando for aparecer.
export function mountSideAds(pairs, local, query) {
  const wide = matchMedia(query);
  let started = false;
  const start = () => { if (wide.matches && !started) { started = true; runAds(pairs, local); } };
  wide.addEventListener("change", start);
  start();
}
