// Gera as páginas que o Google lê: o testador em português (/web/), inglês (/web/en/) e espanhol (/web/es/), com o texto
// já no HTML, os Termos, a Privacidade e o sitemap. Rode depois de mudar docs/web/index.html ou textos "gate.*" e "seo.*":
//   node tools/gerar-seo.mjs
// tests/seo.test.mjs falha se alguém esquecer de rodar.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LANGS, tr } from "../docs/web/js/i18n.js";
import { PRIVACY, TERMS, UPDATED } from "./legal.mjs";

export const ORIGIN = "https://meowdev-mod.github.io/ps5-controle-test";
const LASTMOD = "2026-11-02";
const WA = "https://wa.me/5521966547296?text=";
const FAQ_COUNT = 8;
const TESTS_COUNT = 12;

const VERSIONS = {
  "pt-BR": { dir: "", locale: "pt_BR", og: "og-pt.jpg" },
  en: { dir: "en/", locale: "en_US", og: "og-en.jpg" },
  es: { dir: "es/", locale: "es_ES", og: "og-es.jpg" },
};
const pageUrl = (l) => `${ORIGIN}/web/${VERSIONS[l].dir}`;

const docs = (p) => fileURLToPath(new URL(`../docs/${p}`, import.meta.url));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => esc(s).replace(/"/g, "&quot;");
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

function structuredData(l) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "PS-5 Controle Test",
        url: pageUrl(l),
        description: tr("seo.desc", l),
        inLanguage: l,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Windows, macOS, Linux, ChromeOS, Android, iOS",
        browserRequirements: "USB mode: Chrome or Edge on a computer. Bluetooth mode: any modern browser.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
        featureList: range(TESTS_COUNT).map((n) => tr(`seo.tests.${n}`, l)),
        image: `${ORIGIN}/web/${VERSIONS[l].og}`,
        author: { "@type": "Organization", name: "MeoWDeV MOD" },
      },
      {
        "@type": "FAQPage",
        inLanguage: l,
        mainEntity: range(FAQ_COUNT).map((n) => ({
          "@type": "Question",
          name: tr(`seo.faq.${n}.q`, l),
          acceptedAnswer: { "@type": "Answer", text: tr(`seo.faq.${n}.a`, l) },
        })),
      },
    ],
  };
}

function headBlock(l) {
  const { locale, og } = VERSIONS[l];
  const title = attr(tr("seo.title", l)), desc = attr(tr("seo.desc", l)), url = pageUrl(l), image = `${ORIGIN}/web/${og}`;
  const lines = [
    // /web/en/ e /web/es/ são cópias da mesma página: os arquivos continuam em /web/.
    l === "pt-BR" ? null : '<base href="../">',
    `<title>${esc(tr("seo.title", l))}</title>`,
    `<meta name="description" content="${desc}">`,
    `<link rel="canonical" href="${url}">`,
    ...LANGS.map(([code]) => `<link rel="alternate" hreflang="${code}" href="${pageUrl(code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl("en")}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="PS-5 Controle Test">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${locale}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<script type="application/ld+json">${JSON.stringify(structuredData(l)).replace(/</g, "\\u003c")}</script>`,
  ];
  return lines.filter(Boolean).join("\n");
}

// Coloca o texto do idioma dentro do HTML da tela de entrada, para o Google e as prévias de link lerem sem rodar o script.
function fillTexts(part, l) {
  return part
    .replace(/(<(\w+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (_, open, __, key, close) => open + esc(tr(key, l)) + close)
    .replace(/(<(\w+)\b[^>]*\sdata-i18n-html="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g, (_, open, __, key, close) => open + tr(key, l) + close)
    .replace(/(\sdata-i18n-aria="([^"]+)")(?:\saria-label="[^"]*")?/g, (_, mark, key) => `${mark} aria-label="${attr(tr(key, l))}"`)
    .replace(/(id="gateWa"[^>]*href=")[^"]*"/, (_, start) => `${start}${attr(WA + encodeURIComponent(tr("gate.waMsg", l)))}"`);
}

export function buildPage(template, l) {
  const start = "<!-- seo:start -->", end = "<!-- seo:end -->";
  const gateStart = template.indexOf("<!-- ===================== TELA DE ENTRADA");
  const gateEnd = template.indexOf('<div id="loading"');
  if (!template.includes(start) || gateStart < 0 || gateEnd < 0) throw new Error("docs/web/index.html: faltam as marcas da página");
  const withHead = template.replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => `${start}\n${headBlock(l)}\n${end}`);
  const a = withHead.indexOf("<!-- ===================== TELA DE ENTRADA");
  const b = withHead.indexOf('<div id="loading"');
  const page = withHead.slice(0, a) + fillTexts(withHead.slice(a, b), l) + withHead.slice(b);
  return page.replace(/<html lang="[^"]*"/, `<html lang="${l}"`);
}

const LEGAL_CSS = `:root{color-scheme:dark;--bg:#0c0920;--surface:rgba(255,255,255,.05);--line:rgba(167,139,250,.22);--text:#f3f0ff;--muted:#b9b0dc;--accent:#a78bfa;--warn:#fbbf24}
:root[data-theme="light"]{color-scheme:light;--bg:#f6f4ff;--surface:#fff;--line:rgba(91,63,212,.2);--text:#1b1440;--muted:#5b5480;--accent:#5b3fd4;--warn:#a15c07}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){color-scheme:light;--bg:#f6f4ff;--surface:#fff;--line:rgba(91,63,212,.2);--text:#1b1440;--muted:#5b5480;--accent:#5b3fd4;--warn:#a15c07}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 150px}a{color:var(--accent)}
.brand{font-weight:700;text-decoration:none}nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
nav a{padding:8px 14px;border:1px solid var(--line);border-radius:99px;text-decoration:none;min-height:40px}nav a[aria-current="true"]{background:var(--surface);font-weight:700}
h1{font-size:clamp(30px,6vw,42px);line-height:1.15;margin:8px 0 4px}h2{font-size:20px;margin:26px 0 6px}p,li{color:var(--muted)}p{margin:0 0 10px}ul{margin:0;padding-left:20px}
code{font:13px ui-monospace,Menlo,monospace;overflow-wrap:anywhere}.up{font-size:14px}
button.link{background:none;border:0;padding:0;font:inherit;color:var(--accent);text-decoration:underline;cursor:pointer;min-height:44px}
footer{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:30px;padding-top:14px;border-top:1px solid var(--line);font-size:14px;align-items:center}`;

const LEGAL_NAMES = { pt: "Português", en: "English", es: "Español" };
const LEGAL_PAGES = { termos: ["Termos de uso", TERMS], privacidade: ["Privacidade e cookies", PRIVACY] };

export function buildLegal(slug) {
  const [ptTitle, data] = LEGAL_PAGES[slug];
  const other = slug === "termos" ? "privacidade" : "termos";
  const sections = Object.entries(data).map(([l, d]) => `<article lang="${l === "pt" ? "pt-BR" : l}" data-l="${l}">
<h1>${d.title}</h1>
<p class="up">${UPDATED[l]}</p>
${d.sections.map(([h, body]) => `<h2>${h}</h2>\n${body.startsWith("<ul>") ? body : `<p>${body}</p>`}`).join("\n")}
<footer><a href="../${other}/#${l}">${LEGAL_PAGES[other][1][l].title}</a><a href="../web/${l === "pt" ? "" : `${l}/`}">${{ pt: "Abrir o testador", en: "Open the tester", es: "Abrir el probador" }[l]}</a><button type="button" class="link" data-ck-manage>${{ pt: "Gerenciar cookies", en: "Manage cookies", es: "Gestionar cookies" }[l]}</button></footer>
</article>`).join("\n");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${ptTitle} | PS-5 Controle Test</title>
<meta name="description" content="${attr(data.pt.sections[0][1])}">
<link rel="canonical" href="${ORIGIN}/${slug}/">
<link rel="icon" href="../web/icon-192.png" type="image/png">
<script>try{var t=localStorage.getItem("ps5web.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<style>${LEGAL_CSS}</style>
</head>
<body>
<main>
<a class="brand" href="../">PS-5 Controle Test</a>
<nav aria-label="Idioma / Language">${Object.entries(LEGAL_NAMES).map(([l, name]) => `<a href="#${l}" data-to="${l}" hreflang="${l === "pt" ? "pt-BR" : l}">${name}</a>`).join("")}</nav>
${sections}
</main>
<script type="module">
import { mountConsent } from "../web/js/consent.js";
import { getLang } from "../web/js/i18n.js";
// Sem script, os 3 idiomas ficam visíveis, um abaixo do outro.
const articles = [...document.querySelectorAll("article")], links = [...document.querySelectorAll("nav a")];
function show() {
  const fromSite = getLang() === "pt-BR" ? "pt" : getLang();
  const wanted = location.hash.slice(1);
  const l = articles.some((a) => a.dataset.l === wanted) ? wanted : fromSite;
  articles.forEach((a) => { a.hidden = a.dataset.l !== l; });
  links.forEach((a) => a.setAttribute("aria-current", String(a.dataset.to === l)));
  document.documentElement.lang = l === "pt" ? "pt-BR" : l;
}
addEventListener("hashchange", show);
show();
mountConsent("../");
</script>
</body>
</html>
`;
}

export function buildSitemap() {
  const urls = [`${ORIGIN}/web/`, `${ORIGIN}/web/en/`, `${ORIGIN}/web/es/`, `${ORIGIN}/`, `${ORIGIN}/termos/`, `${ORIGIN}/privacidade/`];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${LASTMOD}</lastmod></url>`).join("\n")}
</urlset>
`;
}

export function allFiles() {
  const template = fs.readFileSync(docs("web/index.html"), "utf8").replace(/\r\n/g, "\n");
  const files = { "sitemap.xml": buildSitemap(), "termos/index.html": buildLegal("termos"), "privacidade/index.html": buildLegal("privacidade") };
  for (const l of Object.keys(VERSIONS)) files[`web/${VERSIONS[l].dir}index.html`] = buildPage(template, l);
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [path, content] of Object.entries(allFiles())) {
    fs.mkdirSync(docs(path).replace(/[\\/][^\\/]*$/, ""), { recursive: true });
    fs.writeFileSync(docs(path), content);
    console.log("ok", path);
  }
}
