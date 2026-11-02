import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL("../docs/" + p, import.meta.url), "utf8");

// roda o script real da página com um aparelho de mentira
function detect(html, nav) {
  const code = html.match(/<script>\s*\/\/ celular ou tablet[^\n]*\n([\s\S]*?)<\/script>/)[1];
  const list = new Set();
  new Function("navigator", "document", code)(nav, { documentElement: { classList: { add: (c) => list.add(c) } } });
  return [...list].sort().join(" ");
}
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/130", platform: "Linux armv8l", maxTouchPoints: 5 };
const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 };
const IPAD = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", platform: "MacIntel", maxTouchPoints: 5 };
const PC = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", platform: "Win32", maxTouchPoints: 0 };
const MAC = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130", platform: "MacIntel", maxTouchPoints: 0 };

for (const page of ["index.html", "web/index.html"]) {
  test("reconhece o aparelho em " + page, () => {
    const html = read(page);
    assert.equal(detect(html, ANDROID), "m");
    assert.equal(detect(html, IPHONE), "ios m");
    assert.equal(detect(html, IPAD), "ios m");
    assert.equal(detect(html, PC), "");
    assert.equal(detect(html, MAC), "");
  });
}

test("testador tem os textos do celular nos três idiomas", () => {
  const src = read("web/js/i18n.js");
  for (const k of ["m.t", "m.d", "m.btn", "m.iosT", "m.ios", "m.bar"]) assert.match(src, new RegExp('"' + k.replace(".", "\\.") + '": \\["[^"]+", "[^"]+", "[^"]+"\\]'), k);
});
