// Conversa direta com o controle por USB (WebHID).
// Comandos e posições de bytes portados do dualshock-tools (licença MIT,
// Copyright (c) 2024 the_al): https://github.com/dualshock-tools/dualshock-tools.github.io
"use strict";

export const SONY = 0x054c;

// ---- modelos reconhecidos
export const MODELS = {
  DS4: { key: "DS4", name: "DualShock 4 (PS4)", sticks: 2 },
  DS5: { key: "DS5", name: "DualSense (PS5)", sticks: 2 },
  EDGE: { key: "EDGE", name: "DualSense Edge (PS5)", sticks: 2 },
  VR2L: { key: "VR2L", name: "PS VR2 Sense · esquerdo", sticks: 1 },
  VR2R: { key: "VR2R", name: "PS VR2 Sense · direito", sticks: 1 },
};

const PRODUCTS = {
  0x05c4: "DS4", 0x09cc: "DS4", 0x0ba0: "DS4", // 0x0ba0 = adaptador sem fio do PS4
  0x0ce6: "DS5", 0x0df2: "EDGE", 0x0e45: "VR2L", 0x0e46: "VR2R",
};

// Filtros do seletor de dispositivos do navegador
export const HID_FILTERS = [0x05c4, 0x09cc, 0x0ce6, 0x0df2, 0x0e45, 0x0e46].map((productId) => ({ vendorId: SONY, productId }));

export function modelFromProductId(pid) {
  return MODELS[PRODUCTS[pid]] || null;
}

// O nome que a Gamepad API dá ao controle muda conforme o navegador:
// Chrome  "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
// Firefox "054c-0ce6-Wireless Controller"
// Safari  "DualSense Wireless Controller" / "DUALSHOCK 4 Wireless Controller"
export function modelFromGamepadId(id) {
  const s = String(id || "");
  const m = s.match(/054c\D{0,12}?([0-9a-f]{4})/i) || s.match(/vendor:\s*054c\s*product:\s*([0-9a-f]{4})/i);
  if (m) { const k = modelFromProductId(parseInt(m[1], 16)); if (k) return k; }
  if (/edge/i.test(s)) return MODELS.EDGE;
  if (/dualsense|ps5/i.test(s)) return MODELS.DS5;
  if (/dualshock|ps4/i.test(s)) return MODELS.DS4;
  if (/vr2|sense controller/i.test(s)) return /\(l\)|left|esq/i.test(s) ? MODELS.VR2L : MODELS.VR2R;
  return null;
}

// ---- nomes dos botões
export const LABELS = {
  cross: "✕ Cruz", circle: "◯ Bola", square: "□ Quadrado", triangle: "△ Triângulo",
  l1: "L1", r1: "R1", l2: "L2", r2: "R2", create: "Create", options: "Options", l3: "L3", r3: "R3",
  up: "↑", down: "↓", left: "←", right: "→", ps: "PS", touchpad: "Touchpad", mute: "Mute",
  fn_left: "Fn esquerdo", fn_right: "Fn direito", paddle_left: "Pá traseira esq.", paddle_right: "Pá traseira dir.",
};
// Índices da Gamepad API no mapeamento "standard" (iguais no PS4 e no PS5)
export const GAMEPAD_ORDER = ["cross", "circle", "square", "triangle", "l1", "r1", "l2", "r2", "create", "options", "l3", "r3", "up", "down", "left", "right", "ps", "touchpad", "mute"];

const BASE = ["cross", "circle", "square", "triangle", "l1", "r1", "l2", "r2", "create", "options", "l3", "r3", "up", "down", "left", "right", "ps", "touchpad"];
export function buttonsOf(modelKey) {
  switch (modelKey) {
    case "DS4": return BASE.slice();
    case "EDGE": return [...BASE, "mute", "fn_left", "fn_right", "paddle_left", "paddle_right"];
    case "VR2L": return ["square", "triangle", "l1", "l2", "create", "l3"];
    case "VR2R": return ["cross", "circle", "r1", "r2", "options", "r3", "ps"];
    default: return [...BASE, "mute"];
  }
}

// ---- leitura do relatório de entrada por USB (63 bytes, sem o ID)
const DS4_MAP = { square: [4, 0x10], cross: [4, 0x20], circle: [4, 0x40], triangle: [4, 0x80], l1: [5, 0x01], r1: [5, 0x02], create: [5, 0x10], options: [5, 0x20], l3: [5, 0x40], r3: [5, 0x80], ps: [6, 0x01], touchpad: [6, 0x02] };
const DS5_MAP = { square: [7, 0x10], cross: [7, 0x20], circle: [7, 0x40], triangle: [7, 0x80], l1: [8, 0x01], r1: [8, 0x02], create: [8, 0x10], options: [8, 0x20], l3: [8, 0x40], r3: [8, 0x80], ps: [9, 0x01], touchpad: [9, 0x02], mute: [9, 0x04] };
const EDGE_MAP = { ...DS5_MAP, fn_left: [9, 0x10], fn_right: [9, 0x20], paddle_left: [9, 0x40], paddle_right: [9, 0x80] };
const VR2L_MAP = { square: [7, 0x01], triangle: [7, 0x08], l1: [7, 0x10], l2: [7, 0x40], create: [8, 0x01], l3: [8, 0x04] };
const VR2R_MAP = { cross: [7, 0x02], circle: [7, 0x04], r1: [7, 0x20], r2: [7, 0x80], options: [8, 0x02], r3: [8, 0x08], ps: [8, 0x10] };

const LAYOUT = {
  DS4: { map: DS4_MAP, dpad: 4, l2: 7, r2: 8, imu: 12, touch: 34 },
  DS5: { map: DS5_MAP, dpad: 7, l2: 4, r2: 5, imu: 15, touch: 32 },
  EDGE: { map: EDGE_MAP, dpad: 7, l2: 4, r2: 5, imu: 15, touch: 32 },
  VR2L: { map: VR2L_MAP, l2: 2, oneStick: true },
  VR2R: { map: VR2R_MAP, r2: 2, oneStick: true },
};

export const axis = (b) => Math.round((b - 127.5) / 128 * 100) / 100;

export function parseInput(modelKey, v) {
  const L = LAYOUT[modelKey];
  const out = { lx: axis(v.getUint8(0)), ly: axis(v.getUint8(1)), rx: 0, ry: 0, l2: 0, r2: 0, pressed: new Set(), imu: null, touches: [] };
  if (!L.oneStick) { out.rx = axis(v.getUint8(2)); out.ry = axis(v.getUint8(3)); }
  if (L.l2 !== undefined) out.l2 = v.getUint8(L.l2) / 255;
  if (L.r2 !== undefined) out.r2 = v.getUint8(L.r2) / 255;
  if (L.dpad !== undefined) {
    const h = v.getUint8(L.dpad) & 0x0f;
    if (h === 0 || h === 1 || h === 7) out.pressed.add("up");
    if (h === 1 || h === 2 || h === 3) out.pressed.add("right");
    if (h === 3 || h === 4 || h === 5) out.pressed.add("down");
    if (h === 5 || h === 6 || h === 7) out.pressed.add("left");
  }
  for (const [name, [byte, mask]] of Object.entries(L.map)) if (v.getUint8(byte) & mask) out.pressed.add(name);
  // gatilho conta como apertado a partir de 50% (igual à Gamepad API)
  if (out.l2 > 0.5) out.pressed.add("l2");
  if (out.r2 > 0.5) out.pressed.add("r2");
  if (L.imu !== undefined) {
    const g = [0, 2, 4].map((i) => v.getInt16(L.imu + i, true) / 14.31);   // graus/s
    const a = [6, 8, 10].map((i) => v.getInt16(L.imu + i, true) / 8192);   // g
    out.imu = { gx: g[0], gy: g[1], gz: g[2], ax: a[0], ay: a[1], az: a[2] };
  }
  if (L.touch !== undefined) {
    for (let i = 0; i < 2; i++) {
      const o = L.touch + i * 4, b0 = v.getUint8(o), b1 = v.getUint8(o + 1), b2 = v.getUint8(o + 2), b3 = v.getUint8(o + 3);
      if ((b0 & 0x80) === 0) out.touches.push({ id: b0 & 0x7f, x: ((b2 & 0x0f) << 8) | b1, y: (b3 << 4) | (b2 >> 4) });
    }
  }
  if (modelKey === "EDGE") { const t = v.getUint8(49); out.stopL2 = (t >> 4) & 3; out.stopR2 = t >> 6; }
  out.battery = parseBattery(modelKey, v);
  return out;
}
export const TOUCH_W = 1920, TOUCH_H = 943;

export function parseBattery(modelKey, v) {
  if (modelKey === "DS4") {
    const b = v.getUint8(29), lvl = b & 0x0f, cable = ((b >> 4) & 1) === 1;
    if (!cable) return { level: lvl < 10 ? lvl * 10 + 5 : 100, charging: false, cable, error: false };
    if (lvl < 10) return { level: Math.min(lvl * 10 + 5, 100), charging: true, cable, error: false };
    if (lvl === 10) return { level: 100, charging: true, cable, error: false };
    if (lvl === 11) return { level: 100, charging: false, cable, error: false };
    return { level: 0, charging: false, cable, error: true };
  }
  const b = v.getUint8(modelKey === "VR2L" || modelKey === "VR2R" ? 41 : 52), lvl = b & 0x0f, st = b >> 4;
  if (st === 0) return { level: Math.min(lvl * 10 + 5, 100), charging: false, cable: false, error: false };
  if (st === 1) return { level: Math.min(lvl * 10 + 5, 100), charging: true, cable: true, error: false };
  if (st === 2) return { level: 100, charging: false, cable: true, error: false };
  if (st === 15) return { level: 0, charging: true, cable: true, error: false };
  return { level: 0, charging: false, cable: false, error: true };
}

// ---- dados de fábrica
export function ds4Board(hwMinor) {
  const a = hwMinor >> 8;
  if (a === 0x31) return "JDM-001";
  if (a === 0x43) return "JDM-011";
  if (a === 0x54) return "JDM-030";
  if (a >= 0x64 && a <= 0x74) return "JDM-040";
  if ((a > 0x80 && a < 0x84) || a === 0x93) return "JDM-020";
  if (a === 0xa4 || a === 0x90 || a === 0xa0) return "JDM-050";
  if (a === 0xb0) return "JDM-055 (Scuf?)";
  if (a === 0xb4) return "JDM-055";
  return "Desconhecida";
}
export function ds5Board(hwinfo) {
  const a = (hwinfo >> 8) & 0xff;
  return { 3: "BDM-010", 4: "BDM-020", 5: "BDM-030", 6: "BDM-040", 7: "BDM-050", 8: "BDM-050", 9: "BDM-060R", 0x11: "BDM-060M", 0x13: "BDM-060X" }[a] || "Desconhecida";
}
const COLORS = {
  "00": "Branco", "01": "Preto Midnight", "02": "Vermelho Cosmic", "03": "Rosa Nova", "04": "Roxo Galactic", "05": "Azul Starlight",
  "06": "Camuflado cinza", "07": "Vermelho Volcanic", "08": "Prata Sterling", "09": "Azul Cobalt", "10": "Chroma Teal", "11": "Chroma Indigo",
  "12": "Chroma Pearl", "13": "HyperPop Techno Red", "14": "HyperPop Remix Green", "15": "HyperPop Rhythm Blue", "30": "30º Aniversário",
  Z1: "God of War Ragnarök", Z2: "Spider-Man 2", Z3: "Astro Bot", Z4: "Fortnite", Z6: "The Last of Us", ZA: "God of War 20 anos",
  ZB: "Icon Blue (edição limitada)", ZC: "Ghost of Yōtei (edição limitada)", ZD: "Marathon (edição limitada)", ZE: "Genshin Impact (edição limitada)", ZF: "007 First Light (edição limitada)",
};
export const ds5Color = (serial) => COLORS[String(serial || "").slice(4, 6)] || "Desconhecida";

// ---- utilidades
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n, d) => n.toString(16).padStart(d, "0").toUpperCase();
const hexBuf = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const ascii = (b) => new TextDecoder().decode(b).replace(/\0/g, "").trim();
const mac = (v, from) => [5, 4, 3, 2, 1, 0].map((i) => hex(v.getUint8(from + i), 2)).join(":");
function withTimeout(p, ms) {
  let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("sem resposta")), ms); })]).finally(() => clearTimeout(t));
}

// ---- controle conectado por USB
export class HidPad {
  constructor(device) {
    this.device = device;
    this.model = modelFromProductId(device.productId);
    this.key = this.model.key;
    this.isDs4 = this.key === "DS4";
    this.isEdge = this.key === "EDGE";
    this.isVr2 = this.key === "VR2L" || this.key === "VR2R";
    this.hasHaptics = !this.isVr2;
    this.out = { rumbleL: 0, rumbleR: 0, r: 0x2f, g: 0x80, b: 0xff, players: 0, mute: 0, trigL: [0, 0, 0, 0], trigR: [0, 0, 0, 0], spk: 0, hp: 0 };
  }

  req(id, data) {
    const fr = this.device.collections[0]?.featureReports || [];
    const item = (fr.find((e) => e.reportId === id)?.items || [])[0];
    const len = item?.reportCount || data.length;
    const a = new Uint8Array(len); a.set(data.slice(0, len)); return a;
  }
  async send(id, data) { await this.device.sendFeatureReport(id, this.req(id, data)); }
  async recv(id, ms = 0) { const p = this.device.receiveFeatureReport(id); return ms ? withTimeout(p, ms) : p; }
  async close() { if (this.device.opened) await this.device.close(); }

  // ---------- informações
  async sysInfo(base, num, len, text = true) {
    await this.send(0x80, [base, num]);
    const v = await this.recv(0x81);
    if (v.getUint8(1) !== base || v.getUint8(2) !== num || v.getUint8(3) !== 2) return null;
    const b = v.buffer.slice(4, 4 + len);
    return text ? ascii(b) : hexBuf(b);
  }

  async info() {
    return this.isDs4 ? this.infoDs4() : this.infoDs5();
  }

  async infoDs4() {
    const v = await this.recv(0xa3);
    const len = v.buffer.byteLength;
    let clone = (v.getUint8(0) !== 0xa3 || len < 49) && len !== 49;
    const build = (ascii(v.buffer.slice(1, 0x10)) + " " + ascii(v.buffer.slice(0x10, 0x20))).trim();
    const hwMaj = v.getUint16(0x21, true), hwMin = v.getUint16(0x23, true), swMaj = v.getUint32(0x25, true), swMin = v.getUint16(0x29, true);
    if (!clone) { try { await this.recv(0x81, 1000); } catch { clone = true; } }
    const items = [
      ["Tipo", clone ? "Possível paralelo (não original)" : "Original Sony", clone ? "bad" : "ok"],
      ["Data do firmware", build],
      ["Versão do hardware", hex(hwMaj, 4) + ":" + hex(hwMin, 4)],
      ["Versão do software", hex(swMaj & 0xffff, 4) + ":" + hex(swMin, 4)],
    ];
    let serial = null, nv = null;
    if (!clone) {
      items.push(["Placa", ds4Board(hwMin)]);
      serial = mac(await this.recv(0x12), 1);
      items.push(["Endereço Bluetooth", serial]);
      nv = await this.nvStatus();
    }
    return { items, extra: [], serial, clone, oldFw: false, nv, board: clone ? null : ds4Board(hwMin), color: null };
  }

  async infoDs5() {
    const v = await this.recv(0x20);
    if (v.getUint8(0) !== 0x20 || v.buffer.byteLength !== 64) throw new Error("Resposta inválida do controle (0x20)");
    const date = ascii(v.buffer.slice(1, 12)), time = ascii(v.buffer.slice(12, 20));
    const fwtype = v.getUint16(20, true), series = v.getUint16(22, true), hw = v.getUint32(24, true), fw = v.getUint32(28, true);
    const upd = v.getUint16(44, true), unk = v.getUint8(46), sbl = v.getUint32(48, true), venom = v.getUint32(52, true), spider = v.getUint32(56, true);
    const serial = await this.sysInfo(1, 19, 17);
    const year = parseInt(date.slice(-4), 10);
    let clone = year > new Date().getFullYear();
    if (!clone) { try { clone = !(await this.finetune()); } catch { clone = true; } }
    const oldFw = / 2020| 2021/.test(" " + date);
    const board = this.isVr2 || this.isEdge ? null : ds5Board(hw);
    const color = this.isVr2 ? null : ds5Color(serial);
    const items = [
      ["Tipo", clone ? "Possível paralelo (não original)" : "Original Sony", clone ? "bad" : "ok"],
      ["Número de série", serial || "—"],
    ];
    if (color) items.push(["Cor", color]);
    if (board) items.push(["Placa", board]);
    items.push(["Firmware", `${date} ${time}`.trim(), oldFw ? "warn" : ""]);
    items.push(["Versão do firmware", "0x" + hex(fw, 8)]);
    const extra = [
      ["Endereço Bluetooth", await this.bdAddr()],
      ["ID único do chip (MCU)", await this.sysInfo(1, 9, 9, false)],
      ["ID da placa (PCBA)", (await this.sysInfo(1, 17, 14) || "").split("").reverse().join("")],
      ["Código da bateria", await this.sysInfo(1, 24, 23)],
      ["Motor de vibração esq.", await this.sysInfo(1, 26, 16)],
      ["Motor de vibração dir.", await this.sysInfo(1, 28, 16)],
      ["Modelo de hardware", "0x" + hex(hw, 8)],
      ["Tipo / série do firmware", "0x" + hex(fwtype, 4) + " / 0x" + hex(series, 4)],
      ["Atualização do firmware", "0x" + hex(upd, 4) + " (0x" + hex(unk, 2) + ")"],
      ["Firmware SBL", "0x" + hex(sbl, 8)],
      ["Firmware Venom", "0x" + hex(venom, 8)],
      ["Firmware Spider", "0x" + hex(spider, 8)],
    ];
    if (!this.isVr2) {
      const tid = await this.sysInfo(5, 2, 8, false), tfw = await this.sysInfo(5, 4, 8, false);
      if (tid) extra.push(["ID do touchpad", tid]);
      if (tfw) extra.push(["Firmware do touchpad", tfw]);
    }
    if (this.isEdge) {
      try {
        const [l, r] = await this.edgeBarcodes();
        extra.push(["Módulo analógico esq.", l || "—"], ["Módulo analógico dir.", r || "—"]);
      } catch { /* alguns Edge não respondem */ }
    }
    const nv = await this.nvStatus();
    return { items, extra: extra.filter((e) => e[1]), serial, clone, oldFw, nv, board, color };
  }

  async bdAddr() { await this.send(0x80, [9, 2]); return mac(await this.recv(0x81), 4); }

  async finetune() {
    await this.send(0x80, [12, this.isEdge ? 4 : 2]);
    await sleep(100);
    const v = await this.recv(0x81);
    if (v.getUint8(0) !== 0x81 || v.getUint8(1) !== 12 || (v.getUint8(2) !== 2 && v.getUint8(2) !== 4) || v.getUint8(3) !== 2) return null;
    return Array.from({ length: 12 }, (_, i) => v.getUint16(4 + i * 2, true));
  }

  async edgeBarcodes() {
    const read = async (i) => { await this.send(0x80, [21, 34, i]); await sleep(100); const v = await this.recv(0x81); return ascii(v.buffer.slice(21, 38)); };
    const r = await read(0), l = await read(1);
    return [l, r];
  }

  // ---------- memória permanente (NVS)
  // locked = alterações ficam só até o controle reiniciar; unlocked = gravação permanente liberada
  async nvStatus() {
    try {
      if (this.isDs4) {
        await this.send(0x08, [0xff, 0, 12]);
        const c = (await this.recv(0x11)).getUint8(1);
        return c === 1 ? "locked" : c === 0 ? "unlocked" : "unknown";
      }
      await this.send(0x80, [3, 3]);
      const r = (await this.recv(0x81)).getUint32(1, false);
      if (r === 0x15010100) return "pending_reboot";
      if (r === 0x03030201) return "locked";
      if (r === 0x03030200) return "unlocked";
      return "unknown";
    } catch { return "error"; }
  }
  async nvLock() {
    if (this.isDs4) { await this.send(0xa0, [10, 1, 0]); return; }
    await this.send(0x80, [3, 1]); await this.recv(0x81);
  }
  async nvUnlock() {
    if (this.isDs4) { await this.send(0xa0, [10, 2, 0x3e, 0x71, 0x7f, 0x89]); return; }
    await this.send(0x80, [3, 2, 101, 50, 64, 12]); await this.recv(0x81);
  }

  // Grava a calibração atual de forma permanente
  async save(progress = () => {}) {
    if (!this.isEdge) { progress(30); await this.nvUnlock(); progress(70); await this.nvLock(); progress(100); return; }
    // DualSense Edge: os analógicos ficam em módulos com memória própria
    progress(10);
    await this.edgeModule(0, [21, 6, 0, 11], [21, 6, 2]); progress(20);
    await this.edgeModule(1, [21, 6, 1, 11], [21, 6, 2]); progress(30);
    await this.nvUnlock(); await sleep(50); progress(45);
    const data = await this.finetune();
    if (!data) throw new Error("Não foi possível ler o ajuste dos analógicos");
    await sleep(50); progress(60);
    await this.send(0x80, data.reduce((a, x) => a.concat([x & 0xff, x >> 8]), [12, 1]));
    await sleep(100);
    await this.edgeModule(0, [21, 4, 0, 8], [21, 4, 2]); progress(80);
    await this.edgeModule(1, [21, 4, 1, 8], [21, 4, 2]); progress(90);
    await sleep(100); await this.nvLock(); await sleep(250); progress(100);
  }
  async edgeModule(i, cmd, expect) {
    await this.send(0x80, cmd); await sleep(200);
    for (let t = 0; t < 10; t++) {
      const v = await this.recv(0x81);
      if (expect.every((b, k) => v.getUint8(1 + k) === b)) return;
      await sleep(50);
    }
    throw new Error(`O módulo ${i === 0 ? "esquerdo" : "direito"} não respondeu`);
  }

  // Reinicia o controle: desfaz o que não foi gravado (ele desconecta e volta sozinho)
  async reboot() {
    try { await (this.isDs4 ? this.send(0xa0, [4, 1, 0]) : this.send(0x80, [1, 1])); } catch { /* o controle cai antes de responder */ }
  }

  // ---------- calibração (stage 1 = centro, 2 = alcance)
  async calib(op, stage) {
    // op: 1 = começar, 2 = gravar, 3 = amostra
    if (this.isDs4) {
      await this.send(0x90, [op, 1, stage]); await sleep(200);
      const a = (await this.recv(0x91)).getUint32(0, false), b = (await this.recv(0x92)).getUint32(0, false);
      const ok = {
        "1-1": [0x91010101, 0x920101ff], "3-1": [0x91010101, 0x920101ff], "2-1": [0x91010102, 0x92010101],
        "1-2": [0x91010201, 0x920102ff], "2-2": [0x91010202, 0x92010201],
      }[op + "-" + stage];
      if (a !== ok[0] || b !== ok[1]) throw new CalibError(op, a.toString(16) + "/" + b.toString(16));
      return;
    }
    await this.send(0x82, [op, 1, stage]);
    let r = (await this.recv(0x83)).getUint32(0, false);
    if (this.isEdge && op === 2) {
      // o Edge confirma em duas etapas
      if (r !== (stage === 1 ? 0x83010101 : 0x83010201)) throw new CalibError(op, r.toString(16));
      await this.send(0x82, [2, 1, stage]);
      r = (await this.recv(0x83)).getUint32(0, false);
      const good = stage === 1 ? [0x83010103, 0x83010312] : [0x83010203];
      if (!good.includes(r)) throw new CalibError(op, r.toString(16));
      return;
    }
    const want = { "1-1": 0x83010101, "3-1": 0x83010101, "2-1": 0x83010102, "1-2": 0x83010201, "2-2": 0x83010202 }[op + "-" + stage];
    if (r !== want) throw new CalibError(op, r.toString(16));
  }
  centerBegin() { return this.calib(1, 1); }
  centerSample() { return this.calib(3, 1); }
  centerEnd() { return this.calib(2, 1); }
  rangeBegin() { return this.calib(1, 2); }
  rangeEnd() { return this.calib(2, 2); }

  // ---------- saídas: vibração, luzes, gatilhos, som
  async output(f0, f1) {
    const o = this.out;
    if (this.isDs4) {
      const b = new Uint8Array(31);
      b[0] = f0; b[3] = o.rumbleR; b[4] = o.rumbleL; b[5] = o.r; b[6] = o.g; b[7] = o.b;
      await this.device.sendReport(0x05, b);
      return;
    }
    const b = new Uint8Array(47);
    b[0] = f0; b[1] = f1; b[2] = o.rumbleR; b[3] = o.rumbleL; b[4] = o.hp; b[5] = o.spk; b[8] = o.mute;
    b.set(o.trigR, 10); b.set(o.trigL, 21);
    b[43] = o.players; b[44] = o.r; b[45] = o.g; b[46] = o.b;
    await this.device.sendReport(0x02, b);
  }
  async initOutput() {
    if (this.isVr2) return;
    try { await (this.isDs4 ? this.output(0x03) : this.output(0, 0xf7)); } catch { /* sem luz, segue */ }
  }
  async rumble(left, right) {
    this.out.rumbleL = left; this.out.rumbleR = right;
    await (this.isDs4 ? this.output(0x01) : this.output(0x03, 0));
  }
  async light(r, g, b) {
    Object.assign(this.out, { r, g, b });
    await (this.isDs4 ? this.output(0x02) : this.output(0, 0x04));
  }
  async playerLeds(mask) { this.out.players = mask & 31; await this.output(0, 0x10); }
  async muteLed(mode) { this.out.mute = mode; await this.output(0, 0x01); }
  async triggers(left, right) {
    const p = (t) => t === "off" ? [0, 0, 0, 0] : [0x02, ...TRIGGER_PRESETS[t]];
    this.out.trigL = p(left); this.out.trigR = p(right);
    await this.output(0x0c, 0);
  }
  async speaker(where = "speaker") {
    this.out.spk = 85; this.out.hp = 55;
    await this.output(0x10 | 0x20 | 0x80, 0);
    await this.send(0x80, where === "headphones" ? [6, 4, 0, 0, 0, 0, 4, 0, 6] : [6, 4, 0, 0, 8]);
    await this.send(0x80, [6, 2, 1, 1, 0]);
  }
  async speakerOff() {
    await this.send(0x80, [6, 2, 0, 1, 0]);
    this.out.spk = 0;
    await this.output(0x20 | 0x80, 0);
  }
}
// início, fim, força
export const TRIGGER_PRESETS = { light: [10, 80, 150], medium: [15, 100, 200], heavy: [20, 120, 255] };

export class CalibError extends Error {
  constructor(op, code) {
    super(op === 1 ? "O controle não aceitou entrar em calibração (" + code + ")" : "A calibração falhou (" + code + ")");
    this.code = code;
  }
}

// ---- circularidade (média do quanto cada setor fica fora do círculo)
export function circularity(sectors, min = 0.15, need = 30) {
  const v = sectors.filter((m) => m > min);
  if (v.length < need) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const err = v.reduce((a, b) => a + Math.abs(b - mean), 0) / v.length / Math.max(mean, 0.01);
  return { err: err * 100, cover: v.length, mean };
}
