// O aceite precisa mudar de verdade o que o site guarda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptionalKey, optionalAllowed, optionalStorage, purgeOptional, readConsent, saveConsent, termsAccepted, TERMS_VERSION } from "../docs/web/js/consent.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

test("sem escolha, nem os termos nem os opcionais estão aceitos", () => {
  const s = fakeStorage();
  assert.equal(readConsent(s), null);
  assert.equal(termsAccepted(s), false);
  assert.equal(optionalAllowed(s), false);
});

test("aceitar tudo libera os opcionais; só o necessário aceita os termos e não libera", () => {
  const all = fakeStorage();
  saveConsent(true, all, 0);
  assert.equal(termsAccepted(all), true);
  assert.equal(optionalAllowed(all), true);
  const min = fakeStorage();
  saveConsent(false, min, 0);
  assert.equal(termsAccepted(min), true);
  assert.equal(optionalAllowed(min), false);
});

test("termos novos pedem um novo aceite", () => {
  const s = fakeStorage({ "ps5web.consent": JSON.stringify({ v: "2000-01-01", optional: true }) });
  assert.equal(termsAccepted(s), false);
  assert.equal(optionalAllowed(s), false);
  assert.ok(TERMS_VERSION > "2000-01-01");
});

test("separa o que é opcional do que é necessário", () => {
  for (const k of ["ps5-ad-ps5-web", "ps5-ad-visto-1", "ps5web.last", "ps5web.unsaved.ABC", "ps5web.fineHistory"]) assert.equal(isOptionalKey(k), true, k);
  for (const k of ["ps5web.lang", "ps5web.theme", "ps5web.consent"]) assert.equal(isOptionalKey(k), false, k);
});

test("só o necessário apaga os opcionais e mantém idioma e tema", () => {
  const s = fakeStorage({ "ps5-ad-ps5-web": "1", "ps5web.last": "{}", "ps5web.fineHistory": "{}", "ps5web.lang": "en", "ps5web.theme": "dark" });
  saveConsent(false, s, 0);
  assert.deepEqual(s.keys().sort(), ["ps5web.consent", "ps5web.lang", "ps5web.theme"]);
});

test("aceitar tudo não apaga nada", () => {
  const s = fakeStorage({ "ps5web.last": "{}" });
  saveConsent(true, s, 0);
  assert.equal(s.getItem("ps5web.last"), "{}");
});

test("sem aceite, o histórico fica só na memória da página", () => {
  const s = fakeStorage();
  saveConsent(false, s, 0);
  const box = optionalStorage(s);
  box.setItem("ps5web.fineHistory", "x");
  assert.equal(box.getItem("ps5web.fineHistory"), "x");
  assert.equal(s.getItem("ps5web.fineHistory"), null);
  box.removeItem("ps5web.fineHistory");
  assert.equal(box.getItem("ps5web.fineHistory"), null);
});

test("com aceite, o histórico fica salvo no navegador", () => {
  const s = fakeStorage();
  saveConsent(true, s, 0);
  const box = optionalStorage(s);
  box.setItem("ps5web.fineHistory", "x");
  assert.equal(s.getItem("ps5web.fineHistory"), "x");
  assert.equal(optionalStorage(s).getItem("ps5web.fineHistory"), "x");
});

test("navegador que não deixa salvar não quebra a escolha nem a limpeza", () => {
  const broken = { length: 0, key() { throw new Error("x"); }, getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  assert.doesNotThrow(() => purgeOptional(broken));
  assert.equal(saveConsent(true, broken, 0).optional, true);
  assert.equal(optionalAllowed(broken), true); // vale na memória até fechar a página
  saveConsent(false, broken, 0);
  const box = optionalStorage(broken);
  box.setItem("a", "1");
  assert.equal(box.getItem("a"), "1");
});
