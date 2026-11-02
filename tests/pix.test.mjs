import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, pixPayload, PIX_KEY } from "../docs/web/js/pix.js";

test("CRC16 confere com o valor de referência", () => {
  assert.equal(crc16("123456789"), "29B1");
});

// lê o código campo a campo, como um app de banco faria
function parse(s) {
  const out = {};
  for (let i = 0; i < s.length;) { const id = s.slice(i, i + 2), n = +s.slice(i + 2, i + 4); out[id] = s.slice(i + 4, i + 4 + n); i += 4 + n; }
  return out;
}

test("código PIX tem a chave, o nome e a cidade certos", () => {
  const p = pixPayload(), f = parse(p), acc = parse(f["26"]);
  assert.equal(PIX_KEY, "+5521966547296");
  assert.equal(acc["00"], "br.gov.bcb.pix");
  assert.equal(acc["01"], "+5521966547296");
  assert.equal(f["53"], "986");
  assert.equal(f["58"], "BR");
  assert.equal(f["59"], "JEFFERSON HONORIO");
  assert.equal(f["60"], "RIO DE JANEIRO");
  assert.equal(f["54"], undefined); // sem valor fixo: quem doa escolhe
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});
