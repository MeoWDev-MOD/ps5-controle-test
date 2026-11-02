// Garante que todo texto usado na página existe nos 3 idiomas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { t, setLang, hasKey, allKeys, incompleteKeys, LANGS } from "../docs/web/js/i18n.js";
import { buttonsOf } from "../docs/web/js/protocol.js";

const read = (p) => fs.readFileSync(new URL("../docs/web/" + p, import.meta.url), "utf8");
const html = read("index.html"), app = read("js/app.js"), proto = read("js/protocol.js");

function usedKeys() {
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html|-aria|-title)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of app.matchAll(/\bt\("([\w.]+)"/g)) keys.add(m[1]);
  for (const m of app.matchAll(/(?:manualItem\("\w+", |loading\(true, |usbGone\()"([\w.]+)"/g)) keys.add(m[1]);
  for (const m of app.matchAll(/\["[↖↗↙↘]", "([\w.]+)"\]/g)) keys.add(m[1]);
  for (const m of app.matchAll(/"(v\.[\w]+)"/g)) keys.add(m[1]);
  for (const m of proto.matchAll(/\["(info\.\w+)"/g)) keys.add(m[1]);
  for (const m of proto.matchAll(/(?:ProtoError|\bt: (?:clone \? )?)\("?(err\.\w+|info\.\w+)"/g)) keys.add(m[1]);
  for (const m of proto.matchAll(/"((?:err|info)\.\w+)"/g)) keys.add(m[1]);
  for (const n of [...buttonsOf("EDGE"), ...buttonsOf("VR2L"), ...buttonsOf("VR2R")]) keys.add("btn." + n);
  for (const s of ["idle", "ok", "warn", "bad", "fail"]) keys.add("vs." + s);
  for (const s of ["locked", "unlocked", "pending_reboot", "unknown", "error"]) { keys.add("nv." + s); keys.add("nv." + s + "D"); }
  for (const c of ["blue", "cyan", "white", "red", "green", "purple", "orange", "pink", "off"]) keys.add("light." + c);
  keys.add("side.L"); keys.add("side.R");
  return keys;
}

test("toda chave usada existe no dicionário", () => {
  // chaves terminadas em "." são prefixos montados no código (ex.: "btn." + nome), conferidos acima
  const missing = [...usedKeys()].filter((k) => !k.endsWith(".") && !hasKey(k));
  assert.deepEqual(missing, []);
});

test("toda chave tem texto nos 3 idiomas", () => {
  assert.deepEqual(incompleteKeys(), []);
  assert.ok(allKeys().length > 200);
  assert.equal(LANGS.length, 3);
});

test("troca as variáveis do texto", () => {
  setLang("en");
  assert.equal(t("bat.level", { n: 55 }), "Battery 55%");
  setLang("es");
  assert.equal(t("v.btnMissing", { a: 2, b: 19, list: "PS" }), "2 de 19 probados. Faltan: PS");
  setLang("pt-BR");
});
