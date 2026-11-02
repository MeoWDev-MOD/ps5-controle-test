import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isPageLink } from "../docs/web/js/pagefx.js";
import { FRAG } from "../docs/web/js/shader.js";

const HOME = "https://site.io/ps5/", WEB = "https://site.io/ps5/web/";
const docs = (p) => new URL("../docs/" + p, import.meta.url);

test("cortina só em link para outra página do site", () => {
  assert.equal(isPageLink("web/", HOME), true);
  assert.equal(isPageLink("../", WEB), true);
  assert.equal(isPageLink("#preco", HOME), false, "âncora na mesma página");
  assert.equal(isPageLink("https://github.com/x/y", HOME), false, "site de fora");
  assert.equal(isPageLink("https://site.io/ps5/app.apk", HOME), false, "download");
  assert.equal(isPageLink("web/", HOME, { target: "_blank" }), false);
  assert.equal(isPageLink("web/", HOME, { modified: true }), false, "ctrl+clique abre outra aba");
});

test("bibliotecas são cópias locais, sem servidor de terceiros", () => {
  for (const f of ["gsap.min.js", "ScrollTrigger.min.js", "lenis.min.js"]) assert.ok(fs.existsSync(docs("web/vendor/" + f)), f);
  for (const page of ["index.html", "web/index.html"]) assert.doesNotMatch(fs.readFileSync(docs(page), "utf8"), /<script[^>]+src="https?:/);
});

test("testador funciona offline com os arquivos novos", () => {
  const sw = fs.readFileSync(docs("web/sw.js"), "utf8");
  for (const f of ["js/shader.js", "js/pagefx.js", "vendor/gsap.min.js"]) {
    assert.ok(sw.includes(`"${f}"`), f);
    assert.ok(fs.existsSync(docs("web/" + f)), f);
  }
});

test("shader define precisão para funcionar em celular", () => {
  assert.match(FRAG, /^precision mediump float;/);
});
