import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBanners } from "../docs/web/js/banners.js";

const ok = { id: "1", title: "Oficina", media_url: "https://abc.supabase.co/storage/v1/object/public/banners/u/a.gif", kind: "image", link_url: "https://loja.com" };

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
