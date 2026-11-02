import { test } from "node:test";
import assert from "node:assert/strict";
import { bannersUrl, cleanBanners, firstIndex } from "../docs/web/js/banners.js";

const ok = { id: "1", title: "Oficina", media_url: "https://abc.supabase.co/storage/v1/object/public/banners/u/a.gif", kind: "image", link_url: "https://loja.com" };

test("pede só os anúncios do lugar", () => {
  assert.equal(bannersUrl("ps5-web"), "https://crm-pessoal-chi.vercel.app/api/banners?local=ps5-web");
});

test("aceita banner válido", () => {
  assert.deepEqual(cleanBanners({ banners: [ok] }), [{ id: "1", title: "Oficina", media: ok.media_url, kind: "image", link: "https://loja.com" }]);
});

test("recusa arquivo de fora do Supabase ou tipo estranho", () => {
  assert.deepEqual(cleanBanners({ banners: [{ ...ok, media_url: "https://malicioso.com/a.gif" }, { ...ok, media_url: "http://abc.supabase.co/a.gif" }, { ...ok, kind: "html" }] }), []);
});

test("link perigoso é descartado, banner fica sem clique", () => {
  assert.equal(cleanBanners({ banners: [{ ...ok, link_url: "javascript:alert(1)" }] })[0].link, null);
});

test("resposta quebrada não derruba o site", () => {
  for (const v of [null, {}, { banners: "x" }, { banners: [null] }]) assert.deepEqual(cleanBanners(v), []);
});

const tres = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("voltou ao site: começa pelo anúncio seguinte ao último visto", () => {
  assert.equal(firstIndex(tres, "a"), 1);
  assert.equal(firstIndex(tres, "b"), 2);
});

test("depois do último anúncio, volta ao primeiro", () => {
  assert.equal(firstIndex(tres, "c"), 0);
});

test("com um anúncio só, continua nele", () => {
  assert.equal(firstIndex([{ id: "a" }], "a"), 0);
});

test("primeira visita ou anúncio que saiu do ar: sorteia dentro da lista", () => {
  assert.equal(firstIndex(tres, null, () => 0), 0);
  assert.equal(firstIndex(tres, "sumiu", () => 0.99), 2);
});

test("sem anúncios não quebra", () => {
  assert.equal(firstIndex([], "a"), 0);
});
