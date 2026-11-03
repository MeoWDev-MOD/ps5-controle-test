// O que o Google lê precisa existir no HTML, em cada idioma, e não pode ficar defasado do testador.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { allFiles, ORIGIN } from "../tools/gerar-seo.mjs";
import { langFromPath, tr } from "../docs/web/js/i18n.js";

const doc = (p) => fs.readFileSync(new URL(`../docs/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pages = { "pt-BR": "web/index.html", en: "web/en/index.html", es: "web/es/index.html" };
const urls = { "pt-BR": `${ORIGIN}/web/`, en: `${ORIGIN}/web/en/`, es: `${ORIGIN}/web/es/` };
const gateOf = (html) => html.slice(html.indexOf("<!-- ===================== TELA DE ENTRADA"), html.indexOf('<div id="loading"'));

test("as páginas geradas estão em dia: rode node tools/gerar-seo.mjs", () => {
  for (const [path, content] of Object.entries(allFiles())) assert.equal(doc(path), content, path);
});

for (const [l, path] of Object.entries(pages)) {
  test(`${l}: título, descrição, endereço e idiomas`, () => {
    const html = doc(path);
    assert.ok(html.includes(`<html lang="${l}"`));
    const title = /<title>([^<]+)<\/title>/.exec(html)[1];
    assert.ok(title.length <= 85, title);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(desc.length >= 120 && desc.length <= 170, `${desc.length}: ${desc}`);
    assert.ok(html.includes(`<link rel="canonical" href="${urls[l]}">`));
    for (const [code, url] of Object.entries(urls)) assert.ok(html.includes(`hreflang="${code}" href="${url}"`), code);
    assert.ok(html.includes('hreflang="x-default"'));
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
  });

  test(`${l}: o texto está no HTML, sem depender do script`, () => {
    const gate = gateOf(doc(path));
    assert.equal((gate.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(gate.includes(tr("gate.title", l)));
    assert.ok(gate.includes(tr("seo.how.t", l).replace(/&/g, "&amp;")));
    const empty = [...gate.matchAll(/<(\w+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>\s*<\/\1>/g)].map((m) => m[2]);
    assert.deepEqual(empty, []);
  });

  test(`${l}: dados estruturados válidos, iguais ao texto visível e sem nota inventada`, () => {
    const html = doc(path);
    const data = JSON.parse(/<script type="application\/ld\+json">(.+?)<\/script>/s.exec(html)[1]);
    const [app, faq] = data["@graph"];
    assert.equal(app["@type"], "WebApplication");
    assert.equal(app.url, urls[l]);
    assert.equal(app.offers.price, "0");
    assert.equal(app.aggregateRating, undefined);
    assert.equal(faq["@type"], "FAQPage");
    assert.equal(faq.mainEntity.length, 8);
    for (const q of faq.mainEntity) assert.ok(gateOf(html).includes(q.name), q.name);
  });

  test(`${l}: botão do WhatsApp com a mensagem do idioma`, () => {
    const href = /id="gateWa"[^>]*href="([^"]+)"/.exec(doc(path))[1].replace(/&amp;/g, "&");
    assert.ok(href.startsWith("https://wa.me/5521966547296?text="));
    assert.equal(decodeURIComponent(href.split("text=")[1]), tr("gate.waMsg", l));
  });
}

test("cópias em outro idioma usam os arquivos de /web/", () => {
  assert.ok(!doc(pages["pt-BR"]).includes("<base "));
  for (const l of ["en", "es"]) assert.ok(doc(pages[l]).includes('<base href="../">'), l);
});

test("o endereço escolhe o idioma", () => {
  assert.equal(langFromPath("/ps5-controle-test/web/en/"), "en");
  assert.equal(langFromPath("/ps5-controle-test/web/es/index.html"), "es");
  assert.equal(langFromPath("/ps5-controle-test/web/"), null);
  assert.equal(langFromPath("/ps5-controle-test/"), null);
});

test("sitemap tem todas as páginas públicas", () => {
  const map = doc("sitemap.xml");
  for (const u of [...Object.values(urls), `${ORIGIN}/`, `${ORIGIN}/termos/`, `${ORIGIN}/privacidade/`]) assert.ok(map.includes(`<loc>${u}</loc>`), u);
});

test("imagens de compartilhamento existem", () => {
  for (const f of ["og-pt.jpg", "og-en.jpg", "og-es.jpg"]) assert.ok(fs.statSync(new URL(`../docs/web/${f}`, import.meta.url)).size > 5000, f);
});

test("termos e privacidade existem nos 3 idiomas e são alcançáveis pelo testador e pela inicial", () => {
  for (const page of ["termos", "privacidade"]) {
    const html = doc(`${page}/index.html`);
    for (const l of ["pt", "en", "es"]) assert.ok(html.includes(`data-l="${l}"`), `${page} ${l}`);
    assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/${page}/">`));
    assert.ok(doc("web/index.html").includes(`href="../${page}/"`), page);
    assert.ok(doc("index.html").includes(`href="${page}/"`), page);
  }
});

test("o testador offline inclui o consentimento e as versões em outro idioma", () => {
  const sw = doc("web/sw.js");
  for (const f of ['"js/consent.js"', '"en/"', '"es/"']) assert.ok(sw.includes(f), f);
});

test("a comparação não diz que a outra ferramenta não tem o que ela tem", () => {
  for (const l of ["pt-BR", "en", "es"]) {
    const a = tr("seo.faq.8.a", l).toLowerCase();
    for (const w of ["adaptáve", "adaptive", "adaptativo", "giroscó", "gyro", "vibra"]) assert.ok(!a.includes(w), `${l}: ${w}`);
    assert.ok(a.includes("mit"));
  }
});
