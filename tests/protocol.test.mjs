// Rodar: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modelFromProductId, modelFromGamepadId, parseInput, parseBattery, buttonsOf,
  ds4Board, ds5Board, ds5Color, circularity, axis, HidPad,
} from "../docs/web/js/protocol.js";

const report = (bytes, len = 63) => { const a = new Uint8Array(len); for (const [i, v] of Object.entries(bytes)) a[i] = v; return new DataView(a.buffer); };
const centered = { 0: 128, 1: 128, 2: 128, 3: 128 };

test("reconhece os modelos pelo product id", () => {
  assert.equal(modelFromProductId(0x05c4).key, "DS4");
  assert.equal(modelFromProductId(0x09cc).key, "DS4");
  assert.equal(modelFromProductId(0x0ce6).key, "DS5");
  assert.equal(modelFromProductId(0x0df2).key, "EDGE");
  assert.equal(modelFromProductId(0x0e45).key, "VR2L");
  assert.equal(modelFromProductId(0x0e46).key, "VR2R");
  assert.equal(modelFromProductId(0x1234), null);
});

test("reconhece o modelo pelo nome que cada navegador dá ao controle", () => {
  assert.equal(modelFromGamepadId("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)").key, "DS4");
  assert.equal(modelFromGamepadId("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)").key, "DS4");
  assert.equal(modelFromGamepadId("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)").key, "DS5");
  assert.equal(modelFromGamepadId("054c-0df2-DualSense Edge Wireless Controller").key, "EDGE");
  assert.equal(modelFromGamepadId("054c-0e46-PS VR2 Sense Controller (R)").key, "VR2R");
  assert.equal(modelFromGamepadId("DUALSHOCK 4 Wireless Controller").key, "DS4");
  assert.equal(modelFromGamepadId("DualSense Wireless Controller").key, "DS5");
  assert.equal(modelFromGamepadId("Xbox 360 Controller (XInput STANDARD GAMEPAD)"), null);
});

test("lista de botões muda conforme o modelo", () => {
  assert.equal(buttonsOf("DS4").includes("mute"), false);
  assert.equal(buttonsOf("DS5").includes("mute"), true);
  assert.equal(buttonsOf("EDGE").includes("paddle_left"), true);
  assert.deepEqual(buttonsOf("VR2L"), ["square", "triangle", "l1", "l2", "create", "l3"]);
});

test("analógico centralizado fica perto de zero e vai de -1 a 1", () => {
  assert.equal(axis(128), 0);
  assert.equal(axis(0), -1);
  assert.equal(axis(255), 1);
});

test("DualSense: botões, d-pad e gatilhos", () => {
  // d-pad = 8 (solto) + Cruz (0x20); L1 + Options; PS + Mute; L2 no máximo
  const v = report({ ...centered, 4: 255, 5: 0, 7: 0x28, 8: 0x21, 9: 0x05 });
  const r = parseInput("DS5", v);
  assert.deepEqual([...r.pressed].sort(), ["cross", "l1", "l2", "mute", "options", "ps"]);
  assert.equal(r.l2, 1);
  assert.equal(r.r2, 0);
});

test("d-pad em diagonal acende duas setas", () => {
  const r = parseInput("DS5", report({ ...centered, 7: 0x01 }));
  assert.deepEqual([...r.pressed].sort(), ["right", "up"]);
});

test("DualShock 4: botões em posições diferentes do DualSense", () => {
  const r = parseInput("DS4", report({ ...centered, 4: 0x08 | 0x80, 5: 0x02, 6: 0x02, 8: 200 }));
  assert.deepEqual([...r.pressed].sort(), ["r1", "r2", "touchpad", "triangle"]);
  assert.ok(r.r2 > 0.78 && r.r2 < 0.79);
});

test("DualSense Edge: botões Fn e pás traseiras", () => {
  const r = parseInput("EDGE", report({ ...centered, 7: 0x08, 9: 0xf0 }));
  assert.deepEqual([...r.pressed].sort(), ["fn_left", "fn_right", "paddle_left", "paddle_right"]);
});

test("VR2 esquerdo: um analógico só e gatilho no byte 2", () => {
  const r = parseInput("VR2L", report({ 0: 255, 1: 128, 2: 255, 7: 0x01 | 0x10 }));
  assert.equal(r.lx, 1);
  assert.equal(r.rx, 0);
  assert.equal(r.l2, 1);
  assert.deepEqual([...r.pressed].sort(), ["l1", "l2", "square"]);
});

test("touchpad: dedo encostado vira ponto com x e y", () => {
  // DS5, toque 1 ativo em x=1000 (0x3E8), y=500 (0x1F4)
  const r = parseInput("DS5", report({ ...centered, 7: 0x08, 32: 0x01, 33: 0xe8, 34: 0x43, 35: 0x1f, 36: 0x80 }));
  assert.equal(r.touches.length, 1);
  assert.deepEqual(r.touches[0], { id: 1, x: 1000, y: 500 });
});

test("bateria do DualSense", () => {
  assert.deepEqual(parseBattery("DS5", report({ 52: 0x05 })), { level: 55, charging: false, cable: false, error: false });
  assert.deepEqual(parseBattery("DS5", report({ 52: 0x13 })), { level: 35, charging: true, cable: true, error: false });
  assert.equal(parseBattery("DS5", report({ 52: 0x20 })).level, 100);
  assert.equal(parseBattery("DS5", report({ 52: 0xb0 })).error, true);
});

test("bateria do DualShock 4", () => {
  assert.deepEqual(parseBattery("DS4", report({ 29: 0x07 })), { level: 75, charging: false, cable: false, error: false });
  assert.deepEqual(parseBattery("DS4", report({ 29: 0x1b })), { level: 100, charging: false, cable: true, error: false });
  assert.equal(parseBattery("DS4", report({ 29: 0x13 })).charging, true);
});

test("placas e cores", () => {
  assert.equal(ds4Board(0x6400), "JDM-040");
  assert.equal(ds4Board(0x9300), "JDM-020");
  assert.equal(ds4Board(0xb400), "JDM-055");
  assert.equal(ds5Board(0x0700), "BDM-050");
  assert.equal(ds5Board(0x1300), "BDM-060X");
  assert.equal(ds5Color("A12305xxx0000000"), "05");
  assert.equal(ds5Color("V55800D7K12061109"), "00");
  assert.equal(ds5Color("A123??xxx"), null);
  assert.equal(ds4Board(0x0100), null);
});

test("circularidade: círculo perfeito dá erro 0, quadrado dá erro alto", () => {
  assert.ok(circularity(new Array(36).fill(0.2), 0.15, 30).err < 1e-9);
  assert.equal(circularity(new Array(10).fill(0.9)), null);
  const square = Array.from({ length: 36 }, (_, i) => { const a = (i + 0.5) / 36 * Math.PI * 2; return 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); });
  assert.ok(circularity(square).err > 8);
});

// ---- comandos enviados ao controle (com um controle simulado)
function fakeDevice(productId, replies) {
  const sent = [];
  return {
    sent, productId, opened: true,
    collections: [{ featureReports: [{ reportId: 0x80, items: [{ reportCount: 63 }] }, { reportId: 0x82, items: [{ reportCount: 9 }] }] }],
    async sendFeatureReport(id, data) { sent.push([id, Array.from(data)]); },
    async receiveFeatureReport(id) { const r = replies[id]; const v = typeof r === "function" ? r() : r; return new DataView(new Uint8Array(v).buffer); },
    async sendReport(id, data) { sent.push(["out", id, Array.from(data)]); },
  };
}

test("calibração do centro no DualSense envia 0x82 [1,1,1] e aceita 83 01 01 01", async () => {
  const d = fakeDevice(0x0ce6, { 0x83: [0x83, 1, 1, 1] });
  await new HidPad(d).centerBegin();
  assert.deepEqual(d.sent[0], [0x82, [1, 1, 1, 0, 0, 0, 0, 0, 0]]);
});

test("calibração recusada vira erro (controle paralelo ou bloqueado)", async () => {
  const d = fakeDevice(0x0ce6, { 0x83: [0x83, 0, 0, 0] });
  await assert.rejects(new HidPad(d).centerBegin());
});

test("gravar permanente no DualSense = desbloquear e bloquear a memória", async () => {
  const d = fakeDevice(0x0ce6, { 0x81: [0x81, 3, 1, 2] });
  await new HidPad(d).save();
  assert.deepEqual(d.sent.map((s) => s[1].slice(0, 6)), [[3, 2, 101, 50, 64, 12], [3, 1, 0, 0, 0, 0]]);
});

test("status da memória do DualSense", async () => {
  assert.equal(await new HidPad(fakeDevice(0x0ce6, { 0x81: [0x81, 3, 3, 2, 1] })).nvStatus(), "locked");
  assert.equal(await new HidPad(fakeDevice(0x0ce6, { 0x81: [0x81, 3, 3, 2, 0] })).nvStatus(), "unlocked");
});

test("vibração do DualShock 4 vai no relatório 0x05 com motores nos bytes 3 e 4", async () => {
  const d = fakeDevice(0x09cc, {});
  await new HidPad(d).rumble(200, 100);
  const [kind, id, b] = d.sent[0];
  assert.equal(kind, "out"); assert.equal(id, 0x05);
  assert.equal(b[0], 0x01); assert.equal(b[3], 100); assert.equal(b[4], 200);
});

test("cor da luz do DualSense vai nos bytes 44-46 com a flag de luz", async () => {
  const d = fakeDevice(0x0ce6, {});
  await new HidPad(d).light(255, 0, 10);
  const b = d.sent[0][2];
  assert.equal(d.sent[0][1], 0x02);
  assert.equal(b[1], 0x04);
  assert.deepEqual(b.slice(44, 47), [255, 0, 10]);
});
