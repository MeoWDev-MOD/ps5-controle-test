import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHistory } from "../docs/web/js/history.js";
import { HidPad } from "../docs/web/js/protocol.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const data = (n) => Array.from({ length: 12 }, (_, i) => n * 100 + i);

test("guarda cópias por número de série, a mais nova primeiro", () => {
  const h = makeHistory(mem());
  h.save("A", data(1), 1000); h.save("A", data(2), 2000); h.save("B", data(9), 3000);
  assert.deepEqual(h.list("A").map((e) => e.data[0]), [200, 100]);
  assert.equal(h.list("B").length, 1);
});

test("cópia igual à última só atualiza a data", () => {
  const h = makeHistory(mem());
  h.save("A", data(1), 1000); h.save("A", data(1), 5000);
  assert.equal(h.list("A").length, 1);
  assert.equal(h.list("A")[0].ts, 5000);
});

test("guarda no máximo 10 por controle", () => {
  const h = makeHistory(mem());
  for (let i = 0; i < 15; i++) h.save("A", data(i), i);
  assert.equal(h.list("A").length, 10);
  assert.equal(h.list("A")[0].data[0], 1400);
});

test("ignora dados inválidos e controle sem série", () => {
  const h = makeHistory(mem());
  assert.equal(h.save("", data(1)), null);
  assert.equal(h.save("A", [1, 2, 3]), null);
  assert.deepEqual(h.list("A"), []);
});

test("ajuste fino vai no relatório 0x80 [12,1] em pares de bytes e respeita o limite do Edge", async () => {
  const sent = [];
  const dev = (pid) => ({ productId: pid, collections: [{ featureReports: [{ reportId: 0x80, items: [{ reportCount: 63 }] }] }], async sendFeatureReport(id, d) { sent.push([id, Array.from(d)]); } });
  await new HidPad(dev(0x0ce6)).writeFinetune([0x1234, ...new Array(11).fill(0)]);
  assert.deepEqual(sent[0][1].slice(0, 4), [12, 1, 0x34, 0x12]);
  await new HidPad(dev(0x0df2)).writeFinetune([9999, ...new Array(11).fill(0)]);
  assert.deepEqual(sent[1][1].slice(2, 4), [4095 & 0xff, 4095 >> 8]);
  await assert.rejects(new HidPad(dev(0x0ce6)).writeFinetune([1, 2]));
});
