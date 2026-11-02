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

export async function fetchBanners(ms = 5000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(BANNERS_URL, { signal: c.signal });
    return r.ok ? cleanBanners(await r.json()) : [];
  } catch { return []; } finally { clearTimeout(t); }
}
