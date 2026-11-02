import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TABS, ITEMS, imgSrc, valScreen, calScreen, nextOpen, summaryText, testedCount } from "../docs/assets/phone.js";
import { DATA } from "../docs/assets/phone-data.js";

const exists = (p) => fs.existsSync(new URL("../docs/" + p, import.meta.url));

test("toda tela, janela e barra capturada existe como imagem", () => {
  for (const k of [...Object.keys(DATA.screens), ...Object.keys(DATA.dialogs), "head", ...TABS.map((_, i) => "nav" + i)]) assert.ok(exists(imgSrc(k)), k);
  for (const s of DATA.sprites) assert.ok(exists(`web/ds/${s.n}.png`), s.n);
});

test("cada estado da validação tem os 11 itens e os selos para marcar", () => {
  for (const k of [...ITEMS.map((_, i) => valScreen(i)), valScreen(-1)]) {
    const s = DATA.screens[k].spots;
    ITEMS.forEach((_, i) => { assert.ok(s["item" + i], `${k} item${i}`); assert.ok(s["badge" + i], `${k} badge${i}`); });
    assert.ok(s.restart && s.summary, k);
  }
});

test("janelas têm o botão que o fluxo espera", () => {
  const has = (k, l) => Object.values(DATA.dialogs[k].spots).some((s) => s.label === l);
  assert.ok(has("dCenter", "Começar") && has("dRange", "Começar") && has("dSave", "Salvar no controle"));
  assert.ok(has("dReset", "Zerar testes") && has("dRestart", "Reiniciar validação") && has("dHist1", "Limpar"));
});

test("regras de navegação", () => {
  assert.equal(valScreen(-1), "vx");
  assert.equal(valScreen(3), "v3");
  assert.equal(calScreen(0, 0), "k0");
  assert.equal(calScreen(0, 2), "kz2");
  assert.equal(calScreen(1, 2), "k1");
  assert.equal(nextOpen(["pass", null, "fail"]), 1);
  assert.equal(nextOpen(["pass", "skip"]), -1);
});

test("resumo e contagem seguem o app", () => {
  assert.equal(summaryText([null, null]), "");
  assert.equal(summaryText(["pass", "fail", null]), "1 passou · 1 falhou · 0 pulado · 1 sem testar");
  assert.equal(testedCount(new Set(["ds_cross"])), 1);
  assert.equal(testedCount(new Set(["ds_l3", "ds_cross"])), 3); // L3 também conta o analógico
});
