"use strict";
import { MODELS, HID_FILTERS, LABELS, GAMEPAD_ORDER, buttonsOf, modelFromGamepadId, parseInput, HidPad, circularity, TOUCH_W, TOUCH_H } from "./protocol.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const HAS_HID = "hid" in navigator;
const store = {
  get(k) { try { return localStorage.getItem("ps5web." + k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem("ps5web." + k) : localStorage.setItem("ps5web." + k, v); } catch { /* modo privado */ } },
};

// ============ estado ao vivo (vem do Bluetooth/Gamepad API ou do USB)
const S = { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, pressed: new Set(), imu: null, touches: [], battery: null, stopL2: null, stopR2: null };
let src = null;          // "pad" = modo básico, "hid" = USB modo completo
let model = null;        // um item de MODELS
let unknownPad = false;  // controle que não é PlayStation
let padIndex = null, padId = "", padStandard = true;
let hid = null, hidInfo = null, wantHid = false, connecting = false;
let busy = false;        // calibração em andamento
let onVal = false;

// ============ resultados dos testes
const tested = new Set();
const sectors = { L: new Array(36).fill(0), R: new Array(36).fill(0) };
const maxTrig = { l2: 0, r2: 0 };
const drift = { L: null, R: null };
const stickDone = { L: false, R: false };
const manual = {};
const touchSeen = { minX: Infinity, maxX: -Infinity, n: 0 };
const trail = [];
let gyroMax = 0;
let log = [];

function addLog(s) {
  log.unshift(new Date().toLocaleTimeString("pt-BR") + "  " + s); log = log.slice(0, 60);
  $("log").textContent = log.join("\n");
}
let toastT;
function toast(msg, kind = "", ms = 4200) {
  const t = $("toast"); t.textContent = msg; t.className = kind; clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add("hidden"), ms);
}

// ============ abas
function tab(name) {
  onVal = name === "val";
  $("pageTest").classList.toggle("hidden", name !== "test");
  $("pageVal").classList.toggle("hidden", name !== "val");
  $("pageTools").classList.toggle("hidden", name !== "tools");
  $("drawCard").classList.toggle("hidden", name === "tools");
  for (const [id, n] of [["tabTest", "test"], ["tabVal", "val"], ["tabTools", "tools"]]) $(id).classList.toggle("on", n === name);
  svgCache.clear();
}
$("tabTest").onclick = () => tab("test"); $("tabVal").onclick = () => tab("val"); $("tabTools").onclick = () => tab("tools");

// ============ desenho do DualSense (recortes em PNG, espaço 880 x 713)
const SPRITES = [
  ["triangle", 697, 201], ["cross", 697, 315], ["circle", 757, 258], ["square", 638, 258], ["l1", 99, 133], ["r1", 657, 132],
  ["l2", 104, 6], ["r2", 674, 6], ["l3", 243, 365], ["r3", 553, 365], ["options", 648, 184], ["create", 210, 185], ["ps", 418, 382],
  ["up", 132, 223, "dpad_up"], ["down", 132, 301, "dpad_down"], ["left", 90, 265, "dpad_left"], ["right", 168, 265, "dpad_right"],
  ["touchpad", 249, 141], ["mute", 415, 452],
];
const TESTED_ALPHA = 70 / 255, STRONG_TESTED_ALPHA = 170 / 255, STICK_TRAVEL = 17;
const img = (n) => { const i = new Image(); i.src = "ds/ds_" + n + ".png"; return i; };
const idle = img("idle"), capL = img("cap_l3"), capR = img("cap_r3");
for (const p of SPRITES) p.img = img(p[3] || p[0]);
const ctx = $("ds").getContext("2d");
const ready = (i) => i.complete && i.naturalWidth > 0;
function put(i, x, y, a) { if (a > 0 && ready(i)) { ctx.globalAlpha = a; ctx.drawImage(i, x, y); } }
function stickOffset(x, y, travel) { const m = Math.hypot(x, y), k = m > 1 ? 1 / m : 1; return [x * k * travel, y * k * travel]; }
const testedAlpha = (n) => tested.has(n) ? (onVal ? STRONG_TESTED_ALPHA : TESTED_ALPHA) : 0;
function trigAlpha(n, v) { return v > 0.02 ? Math.min(1, 0.15 + 0.85 * Math.pow(v, 0.8)) : testedAlpha(n); }
function drawDs5() {
  ctx.clearRect(0, 0, 880, 713);
  put(idle, 0, 0, 1);
  const [lox, loy] = stickOffset(S.lx, S.ly, STICK_TRAVEL), [rox, roy] = stickOffset(S.rx, S.ry, STICK_TRAVEL);
  put(capL, 238 + lox, 359 + loy, 1); put(capR, 547 + rox, 359 + roy, 1);
  for (const p of SPRITES) {
    const n = p[0];
    const a = n === "l2" ? trigAlpha(n, S.l2) : n === "r2" ? trigAlpha(n, S.r2) : S.pressed.has(n) ? 1 : testedAlpha(n);
    const ox = n === "l3" ? lox : n === "r3" ? rox : 0, oy = n === "l3" ? loy : n === "r3" ? roy : 0;
    put(p.img, p[1] + ox, p[2] + oy, a);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#4edea3"; ctx.lineWidth = 6;
  if (stickDone.L) { ctx.beginPath(); ctx.arc(284, 405, 69, 0, 7); ctx.stroke(); }
  if (stickDone.R) { ctx.beginPath(); ctx.arc(593, 405, 69, 0, 7); ctx.stroke(); }
  ctx.fillStyle = "#e6e8ec"; ctx.font = "bold 24px system-ui,sans-serif"; ctx.textAlign = "center";
  ctx.fillText("L2 " + Math.round(S.l2 * 100) + "%", 153, 66); ctx.fillText("R2 " + Math.round(S.r2 * 100) + "%", 723, 66);
}

// ============ desenho do DualShock 4 (SVG do dualshock-tools, licença MIT)
const SVG_IDS = { cross: "Cross", circle: "Circle", square: "Square", triangle: "Triangle", l1: "L1", r1: "R1", l2: "L2", r2: "R2", create: "Create", options: "Options", l3: "L3", r3: "R3", ps: "PS", touchpad: "Trackpad", up: "Up", down: "Down", left: "Left", right: "Right" };
const C_BODY = "#59c8ff", C_LINE = "#2f80ff", C_FILL = "#0c1838", C_PRESS = "#4da0ff", C_OK = "#4edea3";
const svgCache = new Map();
let ds4State = "none"; // none | loading | ready | error
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function paint(id, color) {
  if (svgCache.get(id) === color) return;
  svgCache.set(id, color);
  const g = document.getElementById(id); if (!g) return;
  g.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon").forEach((el) => { el.setAttribute("fill", color); el.setAttribute("stroke", color); });
}
async function loadDs4() {
  if (ds4State !== "none") return;
  ds4State = "loading";
  try {
    const r = await fetch("ds4/ds4.svg"); if (!r.ok) throw new Error(r.status);
    $("ds4").innerHTML = await r.text();
    const svg = $("ds4").querySelector("svg"); svg.removeAttribute("style"); svg.removeAttribute("id");
    paint("Controller", C_BODY);
    for (const id of ["Button_outlines", "Button_outlines_behind", "L3_outline", "R3_outline", "Trackpad_outline"]) paint(id, C_LINE);
    for (const id of ["Controller_infills", "Button_infills", "L3_infill", "R3_infill", "Trackpad_infill"]) paint(id, C_FILL);
    svgCache.clear();
    ds4State = "ready";
  } catch { ds4State = "error"; $("ds4").textContent = "Não foi possível carregar o desenho do DualShock 4."; }
}
function drawDs4() {
  if (ds4State !== "ready") return;
  const base = (n) => tested.has(n) ? mix(C_FILL, C_OK, onVal ? 0.55 : 0.3) : C_FILL;
  for (const [n, id] of Object.entries(SVG_IDS)) {
    let c;
    if (n === "l2" || n === "r2") { const v = S[n]; c = v > 0.02 ? mix(base(n), C_PRESS, Math.min(1, 0.2 + v * 0.8)) : base(n); }
    else c = S.pressed.has(n) ? C_PRESS : base(n);
    paint(id + "_infill", c);
  }
  const t = (g, x, y) => { const el = document.getElementById(g); if (el) el.setAttribute("transform", `translate(${(x * 25).toFixed(1)},${(y * 25).toFixed(1)})`); };
  t("L3", S.lx, S.ly); t("R3", S.rx, S.ry);
  for (const n of ["L2", "R2"]) {
    const el = document.getElementById(n + "_percentage"); if (!el) continue;
    const p = Math.round(S[n.toLowerCase()] * 100);
    el.textContent = p + " %"; el.setAttribute("opacity", p > 0 ? "1" : "0"); el.setAttribute("fill", "#ffffff");
  }
}

// ============ painel de botões (PS VR2 e controles sem desenho)
const chipEls = new Map();
function buildChips(box, names) {
  box.innerHTML = "";
  for (const n of names) {
    const d = document.createElement("div"); d.className = "chip"; d.textContent = LABELS[n] || n;
    box.appendChild(d); chipEls.set(n, d);
  }
}
function drawChips() {
  for (const [n, el] of chipEls) {
    el.classList.toggle("down", S.pressed.has(n));
    el.classList.toggle("tested", tested.has(n));
  }
}

// ============ troca de modelo: escolhe desenho, analógicos e gatilhos
let view = "ds5", valSig = "";
function setModel(m, unknown = false) {
  unknownPad = unknown;
  if (model === m) return;
  model = m;
  const k = m.key;
  view = k === "DS4" ? "ds4" : (k === "VR2L" || k === "VR2R") ? "panel" : "ds5";
  if (view === "ds4") loadDs4();
  $("ds").classList.toggle("hidden", view !== "ds5");
  $("ds4").classList.toggle("hidden", view !== "ds4");
  $("panel").classList.toggle("hidden", view !== "panel");
  chipEls.clear();
  if (view === "panel") buildChips($("panel"), buttonsOf(k));
  if (k === "EDGE") buildChips($("extras"), ["fn_left", "fn_right", "paddle_left", "paddle_right"]); else $("extras").innerHTML = "";
  const one = m.sticks === 1;
  $("stickR").classList.toggle("hidden", one); $("sticks").classList.toggle("one", one);
  $("rowL2").classList.toggle("hidden", k === "VR2R"); $("rowR2").classList.toggle("hidden", k === "VR2L");
  svgCache.clear();
}

// ============ analógicos
function drawStick(cv, x, y, sec) {
  const c = cv.getContext("2d"), s = cv.width, r = s / 2;
  c.clearRect(0, 0, s, s);
  c.strokeStyle = "rgba(160,200,255,.25)"; c.lineWidth = 1;
  [0.33, 0.66, 1].forEach((k) => { c.beginPath(); c.arc(r, r, (r - 6) * k, 0, 7); c.stroke(); });
  c.beginPath(); c.moveTo(6, r); c.lineTo(s - 6, r); c.moveTo(r, 6); c.lineTo(r, s - 6); c.stroke();
  // trilha do máximo alcançado em cada setor (gráfico de circularidade)
  const n = sec.length;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) + 0.5) / n * Math.PI * 2, m = Math.min(sec[i % n], 1) * (r - 6);
    const px = r + Math.cos(a) * m, py = r + Math.sin(a) * m;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fillStyle = "rgba(78,222,163,.15)"; c.fill(); c.strokeStyle = "rgba(78,222,163,.8)"; c.lineWidth = 2; c.stroke();
  const px = r + x * (r - 6), py = r + y * (r - 6);
  c.beginPath(); c.arc(px, py, Math.max(5, s / 27), 0, 7); c.fillStyle = "#59c8ff"; c.fill();
}
function stickStep(key, x, y) {
  const m = Math.hypot(x, y);
  if (m > 0.25) {
    const s = Math.floor(((Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 36) % 36;
    sectors[key][s] = Math.max(sectors[key][s], m);
  }
  if (m < 0.2) drift[key] = drift[key] === null ? m : Math.min(drift[key], m); // leitura em repouso
  if (m > 0.9) stickDone[key] = true;
  drawStick($(key === "L" ? "cvL" : "cvR"), x, y, sectors[key]);
  $(key === "L" ? "numL" : "numR").textContent = `X ${x.toFixed(2)}  Y ${y.toFixed(2)}  |${m.toFixed(2)}|`;
}

// ============ touchpad e giroscópio (só USB)
function drawTouch() {
  const cv = $("touch"), c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = "rgba(160,200,255,.18)"; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  const now = performance.now();
  while (trail.length && now - trail[0].t > 900) trail.shift();
  for (const p of trail) {
    const a = 1 - (now - p.t) / 900;
    c.fillStyle = p.id % 2 ? `rgba(78,222,163,${a * 0.5})` : `rgba(89,200,255,${a * 0.5})`;
    c.beginPath(); c.arc(p.x / TOUCH_W * w, p.y / TOUCH_H * h, 5, 0, 7); c.fill();
  }
  for (const p of S.touches) { c.fillStyle = "#fff"; c.beginPath(); c.arc(p.x / TOUCH_W * w, p.y / TOUCH_H * h, 10, 0, 7); c.fill(); }
  $("touchTxt").textContent = S.touches.length ? S.touches.map((p, i) => `Dedo ${i + 1}: x ${p.x} · y ${p.y}`).join("  ") : "Passe o dedo no touchpad.";
}
function drawImu() {
  const i = S.imu; if (!i) return;
  const f = (v) => (v >= 0 ? " " : "") + v.toFixed(1);
  const g = Math.hypot(i.ax, i.ay, i.az);
  $("imu").innerHTML = `<b>Giroscópio</b> (°/s)<br>X ${f(i.gx)} · Y ${f(i.gy)} · Z ${f(i.gz)}<br><b>Acelerômetro</b> (g)<br>X ${f(i.ax)} · Y ${f(i.ay)} · Z ${f(i.az)}<br>Total ${g.toFixed(2)} g ${g > 0.85 && g < 1.15 ? "(normal em repouso)" : ""}<br>Maior giro: ${gyroMax.toFixed(0)}°/s`;
}

// ============ status
function batteryTxt(b) {
  if (!b) return "";
  if (b.error) return "Bateria: erro";
  return `Bateria ${b.level}%` + (b.charging ? " ⚡ carregando" : b.cable && b.level === 100 ? " · carregada" : "");
}
let lastPills = "";
function renderStatus() {
  const on = src !== null;
  $("dot").className = "dot" + (src === "hid" ? " hid" : on ? " on" : "");
  if (!on) {
    $("stTitle").textContent = connecting ? "Conectando…" : "Nenhum controle detectado";
    $("stSub").textContent = "Conecte o controle e aperte qualquer botão.";
  } else if (src === "hid") {
    $("stTitle").textContent = model.name + " conectado";
    const bits = [hidInfo?.color, hidInfo?.board, hidInfo?.serial && "série " + hidInfo.serial].filter(Boolean);
    $("stSub").textContent = bits.join(" · ") || "Conectado pelo cabo USB";
  } else {
    $("stTitle").textContent = (unknownPad ? "Controle" : model.name) + " conectado";
    $("stSub").textContent = padId + (padStandard ? "" : " · mapeamento não padrão");
  }
  const pills = [];
  if (src === "hid") pills.push(`<span class="badge info">USB · modo completo</span>`);
  if (src === "pad") pills.push(`<span class="badge">Modo básico</span>`);
  if (src === "hid" && hidInfo?.clone) pills.push(`<span class="badge bad">Possível paralelo</span>`);
  if (src === "hid" && isUnsaved()) pills.push(`<span class="badge warn">Calibração não salva</span>`);
  if (S.battery) pills.push(`<span class="badge">${esc(batteryTxt(S.battery))}</span>`);
  const html = pills.join("");
  if (html !== lastPills) { $("pills").innerHTML = html; lastPills = html; }
  $("btnUsb").classList.toggle("hidden", !HAS_HID || src === "hid");
  $("btnUsbOff").classList.toggle("hidden", src !== "hid");
  $("btnUsb").disabled = connecting;
  notice();
}
function notice() {
  let h = "";
  if (!src) h = "Ligue o controle por <b>cabo USB ou Bluetooth</b> e <b>aperte um botão</b>: o navegador só mostra o controle depois do primeiro toque nele.";
  else if (src === "pad") {
    if (!padStandard) h = "Este navegador não organiza os botões do controle no padrão e alguns podem acender errado. Use o <b>Chrome</b> ou o <b>Edge</b>.";
    else if (unknownPad) h = "Este controle não parece ser de PlayStation. Os testes funcionam, mas o desenho é do DualSense.";
    else if (model.key === "VR2L" || model.key === "VR2R") h = "Para o PS VR2 Sense, use o <b>modo completo por USB</b>: pelo Bluetooth o navegador pode trocar os botões.";
    else if (HAS_HID) h = "Quer número de série, placa, calibração e luzes? Ligue o cabo USB e toque em <b>Conectar por USB</b>.";
  }
  if ($("notice").innerHTML !== h) $("notice").innerHTML = h;
}
function usbHint() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const t = HAS_HID ? "" : mobile ? "O modo completo funciona no computador (Chrome ou Edge). No celular Android, use o app." : "Seu navegador não tem acesso direto ao USB. Use o Chrome ou o Edge para o modo completo.";
  $("usbHint").textContent = t;
  $("hidSupport").innerHTML = HAS_HID
    ? "Seu navegador é compatível. Feche programas que usam o controle (Steam, DS4Windows) antes de conectar."
    : "<b>Este navegador não tem acesso direto ao USB.</b> " + (mobile ? "No celular, use o app Android pelo cabo USB." : "Abra esta página no Chrome ou no Edge do computador.");
  $("btnUsb2").disabled = !HAS_HID;
}

// ============ última conexão e calibração não salva
const unsavedKey = () => hidInfo?.serial ? "unsaved." + hidInfo.serial : null;
const isUnsaved = () => { const k = unsavedKey(); return !!k && store.get(k) === "1"; };
function setUnsaved(v) { const k = unsavedKey(); if (k) store.set(k, v ? "1" : null); renderTools(); renderLast(); }
function renderLast() {
  let info = null; try { info = JSON.parse(store.get("last") || "null"); } catch { /* ignora */ }
  if (!info || src === "hid") { $("last").innerHTML = ""; return; }
  const bits = [info.color, info.board, info.name].filter(Boolean).join(" ");
  const warn = info.serial && store.get("unsaved." + info.serial) === "1";
  $("last").innerHTML = `Última conexão por USB: <b>${esc(bits)}</b>${info.serial ? ", série " + esc(info.serial) : ""}` +
    (warn ? `<div class="warnline">Esse controle tem uma calibração não salva, que some quando ele reinicia.</div>` : "");
}

// ============ leitura pelo Bluetooth / Gamepad API (modo básico)
function readPad() {
  const list = (navigator.getGamepads && navigator.getGamepads()) || [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}
window.addEventListener("gamepadconnected", (e) => addLog("Conectado: " + e.gamepad.id));
window.addEventListener("gamepaddisconnected", () => addLog("Controle desconectado"));
function pollPad() {
  const g = readPad();
  if (!g) {
    if (src === "pad") { src = null; padIndex = null; clearLive(); renderStatus(); }
    return;
  }
  if (src !== "pad" || padIndex !== g.index) { addLog("Lendo: " + g.id); src = "pad"; padIndex = g.index; }
  padId = g.id; padStandard = g.mapping === "standard";
  const m = modelFromGamepadId(g.id);
  setModel(m || MODELS.DS5, !m);
  S.pressed.clear();
  g.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && GAMEPAD_ORDER[i]) S.pressed.add(GAMEPAD_ORDER[i]); });
  S.lx = g.axes[0] || 0; S.ly = g.axes[1] || 0; S.rx = g.axes[2] || 0; S.ry = g.axes[3] || 0;
  S.l2 = g.buttons[6] ? g.buttons[6].value : 0; S.r2 = g.buttons[7] ? g.buttons[7].value : 0;
  S.imu = null; S.touches = []; S.battery = null;
}
function clearLive() {
  S.pressed.clear(); S.lx = S.ly = S.rx = S.ry = S.l2 = S.r2 = 0; S.imu = null; S.touches = []; S.battery = null; S.stopL2 = S.stopR2 = null;
}

// ============ USB (WebHID): modo completo
async function connectUsb() {
  if (!HAS_HID) { toast("Este navegador não tem acesso ao USB. Use Chrome ou Edge no computador.", "bad"); return; }
  if (connecting || hid) return;
  let dev;
  try {
    const known = (await navigator.hid.getDevices()).filter((d) => HID_FILTERS.some((f) => f.productId === d.productId));
    dev = known[0] || (await navigator.hid.requestDevice({ filters: HID_FILTERS }))[0];
  } catch (e) { toast("Não foi possível abrir a lista de controles: " + e.message, "bad"); return; }
  if (!dev) return;
  await openDevice(dev);
}
async function openDevice(dev) {
  connecting = true; renderStatus();
  try {
    if (dev.opened) { await dev.close(); await sleep(300); }
    await dev.open();
  } catch (e) {
    connecting = false; renderStatus();
    toast("O controle está ocupado. Feche Steam, DS4Windows ou outra aba que esteja usando ele e tente de novo.", "bad", 7000);
    return;
  }
  let first = true;
  dev.oninputreport = (e) => {
    if (!first) return;
    first = false; dev.oninputreport = null;
    setupDevice(dev, e.data).catch(async (err) => {
      connecting = false; renderStatus();
      toast("Falha ao conectar: " + err.message, "bad", 7000); addLog("Erro: " + err.message);
      try { await dev.close(); } catch { /* já fechado */ }
    });
  };
  // se nada chegar em 3 s, avisa
  setTimeout(() => { if (first && connecting) { connecting = false; renderStatus(); toast("O controle não respondeu. Desligue e ligue o cabo e tente de novo.", "bad"); dev.close().catch(() => {}); } }, 3000);
}
async function setupDevice(dev, data) {
  if (data.byteLength !== 63) {
    await dev.close();
    connecting = false; renderStatus();
    toast("O controle está ligado por Bluetooth. Para o modo completo, use o cabo USB. O modo básico continua funcionando.", "", 8000);
    return;
  }
  const p = new HidPad(dev);
  let info = null;
  try { info = await p.info(); } catch (e) { addLog("Não li as informações: " + e.message); }
  if (info && !info.clone) await p.initOutput();
  if (info?.nv === "unlocked") { try { await p.nvLock(); info.nv = await p.nvStatus(); } catch { /* segue */ } }
  hid = p; hidInfo = info; wantHid = true; connecting = false;
  src = "hid"; clearLive(); setModel(p.model);
  dev.oninputreport = onReport;
  if (info) store.set("last", JSON.stringify({ name: p.model.name, serial: info.serial, board: info.board, color: info.color, when: Date.now() }));
  addLog("USB: " + p.model.name + (info?.serial ? " · série " + info.serial : ""));
  renderStatus(); renderTools(); renderLast();
  if (info?.nv === "pending_reboot") toast("Este controle precisa reiniciar: desligue e ligue o cabo USB.", "bad", 8000);
  else if (isUnsaved()) toast("Este controle tem uma calibração não salva. Veja a aba Ferramentas.", "", 7000);
  else toast(p.model.name + " conectado no modo completo.", "ok");
}
function onReport(e) {
  if (!hid) return;
  let r; try { r = parseInput(hid.key, e.data); } catch { return; }
  S.lx = r.lx; S.ly = r.ly; S.rx = r.rx; S.ry = r.ry; S.l2 = r.l2; S.r2 = r.r2; S.pressed = r.pressed;
  S.imu = r.imu; S.touches = r.touches; S.battery = r.battery; S.stopL2 = r.stopL2 ?? null; S.stopR2 = r.stopR2 ?? null;
  const t = performance.now();
  for (const p of r.touches) {
    trail.push({ x: p.x, y: p.y, id: p.id, t });
    touchSeen.minX = Math.min(touchSeen.minX, p.x); touchSeen.maxX = Math.max(touchSeen.maxX, p.x); touchSeen.n++;
  }
  if (trail.length > 400) trail.splice(0, trail.length - 400);
  if (r.imu) gyroMax = Math.max(gyroMax, Math.abs(r.imu.gx), Math.abs(r.imu.gy), Math.abs(r.imu.gz));
}
function usbGone(msg = "Controle USB desconectado.") {
  if (!hid) return;
  hid = null; hidInfo = null;
  if (src === "hid") { src = null; clearLive(); }
  if (busy) { busy = false; showMsg("Controle desconectado", "O controle saiu no meio da operação. Ligue o cabo de novo e confira os analógicos; se algo ficou estranho, reinicie o controle.", "bad"); }
  addLog(msg); toast(msg);
  renderStatus(); renderTools(); renderLast();
}
if (HAS_HID) {
  navigator.hid.addEventListener("disconnect", (e) => { if (hid && e.device === hid.device) usbGone(); });
  // depois de reiniciar o controle (Desfazer), ele volta sozinho
  navigator.hid.addEventListener("connect", (e) => { if (wantHid && !hid && !connecting && HID_FILTERS.some((f) => f.productId === e.device.productId)) setTimeout(() => openDevice(e.device), 800); });
}
$("btnUsb").onclick = connectUsb; $("btnUsb2").onclick = connectUsb;
$("btnUsbOff").onclick = async () => { wantHid = false; const d = hid?.device; usbGone("USB desconectado."); try { await d?.close(); } catch { /* ok */ } };

// ============ vibração rápida (aba Controle)
$("btnRumble").onclick = async () => {
  const msg = $("rumbleMsg");
  if (src === "hid") {
    if (!hid.hasHaptics) { msg.textContent = "Este controle não tem vibração controlável por aqui."; return; }
    try { await hid.rumble(255, 255); await sleep(600); await hid.rumble(0, 0); msg.textContent = "Vibração enviada. O controle vibrou? Marque na aba Validação."; }
    catch (e) { msg.textContent = "Falhou: " + e.message; }
    return;
  }
  const g = readPad();
  if (!g) { msg.textContent = "Conecte o controle primeiro."; return; }
  const act = g.vibrationActuator || (g.hapticActuators && g.hapticActuators[0]);
  if (!act) { msg.textContent = "Este navegador não libera a vibração do controle. Tente no Chrome ou no Edge, ou conecte por USB."; return; }
  try {
    if (act.playEffect) await act.playEffect("dual-rumble", { duration: 600, strongMagnitude: 1, weakMagnitude: 1 });
    else if (act.pulse) await act.pulse(1, 600);
    msg.textContent = "Vibração enviada. O controle vibrou? Marque na aba Validação.";
  } catch (e) { msg.textContent = "Falhou: " + e.message; }
};

// ============ validação
const LABEL = { idle: "Pendente", ok: "OK", warn: "Em andamento", bad: "Atenção", fail: "Falhou" };
function stickDesc(k) {
  const c = circularity(sectors[k]), cover = sectors[k].filter((m) => m > 0.15).length;
  const rest = drift[k] === null ? "" : ` · repouso ${drift[k].toFixed(2)}${drift[k] > 0.1 ? " (possível drift)" : ""}`;
  return c ? `Círculo completo · erro médio ${c.err.toFixed(1)}%${rest}` : `Gire em círculo completo (${cover}/36 setores)${rest}`;
}
function stickSt(k) {
  const c = circularity(sectors[k]); if (!c) return sectors[k].some((m) => m > 0.15) ? "warn" : "idle";
  if (drift[k] !== null && drift[k] > 0.1) return "bad";
  return c.err < 12 ? "ok" : "warn";
}
const trigItem = (n) => ({ id: n, t: "Gatilho " + n.toUpperCase(), d: () => `Máximo ${Math.round(maxTrig[n] * 100)}%`, st: () => maxTrig[n] > 0.95 ? "ok" : maxTrig[n] > 0 ? "warn" : "idle" });
const manualItem = (id, t, d) => ({ id, t, d: () => d, st: () => manual[id] || "idle", manual: true });
function items() {
  const k = model?.key || "DS5", usb = src === "hid", vr2 = k === "VR2L" || k === "VR2R";
  const req = buttonsOf(k).filter((n) => usb || !["touchpad", "mute"].includes(n));
  const L = [manualItem("usb", "Conector USB", "Balance o cabo com cuidado e veja se o controle desconecta.")];
  L.push({
    id: "btn", t: "Botões",
    d: () => { const f = req.filter((n) => !tested.has(n)); return f.length ? `${req.length - f.length} de ${req.length} testados. Faltam: ${f.map((n) => LABELS[n]).join(", ")}` : "Todos os botões responderam" + (usb ? "" : " (Touchpad e Mute dependem do navegador)"); },
    st: () => req.every((n) => tested.has(n)) ? "ok" : req.some((n) => tested.has(n)) ? "warn" : "idle",
  });
  if (vr2) L.push({ id: "L", t: "Analógico", d: () => stickDesc("L"), st: () => stickSt("L") });
  else L.push({ id: "L", t: "Analógico esquerdo", d: () => stickDesc("L"), st: () => stickSt("L") }, { id: "R", t: "Analógico direito", d: () => stickDesc("R"), st: () => stickSt("R") });
  if (k !== "VR2R") L.push(trigItem("l2"));
  if (k !== "VR2L") L.push(trigItem("r2"));
  if (usb && !vr2) {
    L.push({ id: "touch", t: "Touchpad", d: () => touchSeen.n ? `Toques lidos de ${Math.round((touchSeen.maxX - touchSeen.minX) / TOUCH_W * 100)}% da largura. Passe o dedo de ponta a ponta.` : "Passe o dedo de uma ponta à outra do touchpad.",
      st: () => touchSeen.n === 0 ? "idle" : (touchSeen.maxX - touchSeen.minX) / TOUCH_W > 0.7 ? "ok" : "warn" });
    L.push({ id: "gyro", t: "Giroscópio", d: () => gyroMax ? `Maior giro lido: ${gyroMax.toFixed(0)}°/s. Gire o controle rápido.` : "Gire o controle no ar.", st: () => gyroMax > 150 ? "ok" : gyroMax > 20 ? "warn" : "idle" });
  }
  if (!vr2) L.push(manualItem("vib", "Vibração", usb ? "Em Ferramentas, teste cada motor e diga se os dois vibraram." : "Na aba Controle, toque em Testar vibração e diga se o controle vibrou."));
  if (usb && !vr2) L.push(manualItem("light", "Luzes", "Em Ferramentas, troque a cor da luz e veja se ela muda."));
  if (usb && (k === "DS5" || k === "EDGE")) L.push(manualItem("spk", "Alto-falante", "Em Ferramentas, toque o som e diga se saiu bipe do controle."));
  return L;
}
let ITEMS = [], rows = [];
function buildVal() {
  const sig = (model?.key || "-") + src;
  if (sig === valSig) return;
  valSig = sig; ITEMS = items();
  $("valList").innerHTML = "";
  rows = ITEMS.map((it) => {
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<div><div class="t">${esc(it.t)}</div><div class="d"></div>${it.manual ? '<div class="acts"><button class="b sm" data-v="ok">Passou</button><button class="b sm" data-v="fail">Falhou</button></div>' : ""}</div><span class="badge"></span>`;
    r.querySelectorAll("[data-v]").forEach((b) => { b.onclick = () => { manual[it.id] = b.dataset.v; addLog(it.t + ": " + LABEL[b.dataset.v]); renderVal(); }; });
    $("valList").appendChild(r); return r;
  });
}
function renderVal() {
  buildVal();
  let ok = 0;
  ITEMS.forEach((it, i) => {
    const s = it.st(); if (s === "ok") ok++;
    rows[i].querySelector(".d").textContent = it.d();
    const b = rows[i].querySelector(".badge"); b.textContent = LABEL[s]; b.className = "badge " + (s === "idle" ? "" : s === "fail" ? "bad" : s);
  });
  $("sum").textContent = `${ok} / ${ITEMS.length}`;
}
$("btnReset").onclick = () => {
  tested.clear(); sectors.L.fill(0); sectors.R.fill(0); maxTrig.l2 = maxTrig.r2 = 0; drift.L = drift.R = null;
  stickDone.L = stickDone.R = false; for (const k of Object.keys(manual)) delete manual[k];
  touchSeen.minX = Infinity; touchSeen.maxX = -Infinity; touchSeen.n = 0; gyroMax = 0; trail.length = 0;
  log = []; $("log").textContent = ""; svgCache.clear(); renderVal();
};

// ============ janela (calibração e confirmações)
const dlg = $("dlg");
dlg.addEventListener("cancel", (e) => { if (busy) e.preventDefault(); });
function showDlg(html) { $("dlgBody").innerHTML = html; if (!dlg.open) dlg.showModal(); }
function closeDlg() { if (dlg.open) dlg.close(); }
function showMsg(title, text, kind = "ok") {
  showDlg(`<h3>${esc(title)}</h3><div class="alert ${kind === "bad" ? "bad" : ""}">${text}</div><div class="acts"><button class="b p" id="dlgOk">Entendi</button></div>`);
  $("dlgOk").onclick = closeDlg; $("dlgOk").focus();
}
function confirmDlg(title, html, okLabel, cls = "p") {
  return new Promise((res) => {
    showDlg(`<h3>${esc(title)}</h3>${html}<div class="acts"><button class="b ${cls}" id="dlgYes">${esc(okLabel)}</button><button class="b" id="dlgNo">Cancelar</button></div>`);
    const done = (v) => { dlg.removeEventListener("close", onClose); res(v); };
    const onClose = () => done(false);
    dlg.addEventListener("close", onClose);
    $("dlgYes").onclick = () => done(true);
    $("dlgNo").onclick = () => { closeDlg(); };
    $("dlgNo").focus();
  });
}
const waitClick = (id) => new Promise((res) => { $(id).onclick = () => res(); });
const steps = (n, cur) => `<div class="steps">${Array.from({ length: n }, (_, i) => `<i class="${i < cur ? "done" : i === cur ? "on" : ""}"></i>`).join("")}</div>`;
function failMsg(e) {
  busy = false;
  showMsg("A operação não terminou", esc(e.message) + "<br><br>Se os analógicos ficarem estranhos, use <b>Desfazer (reiniciar o controle)</b> na aba Ferramentas ou desligue e ligue o cabo: o que não foi salvo some.", "bad");
  addLog("Erro: " + e.message);
}

// ============ calibração
function calibBlock() {
  if (!hidInfo) return "Não consegui ler as informações deste controle, então a calibração fica bloqueada por segurança.";
  if (hidInfo.clone) return "Este controle parece ser paralelo (não original). A calibração da Sony não funciona nele e pode travar o controle.";
  if (hidInfo.oldFw) return "O firmware do controle é antigo (2020/2021). Atualize o controle no PS5 ou no app oficial da Sony no computador antes de calibrar.";
  if (hidInfo.nv === "pending_reboot") return "O controle precisa reiniciar antes. Desligue e ligue o cabo USB.";
  return "";
}
async function centerWizard() {
  if (!hid || busy || calibBlock()) return;
  const quick = hid.key === "DS5" || hid.key === "EDGE", one = hid.model.sticks === 1;
  const os = one ? "o analógico" : "os dois analógicos";
  const intro = quick
    ? `<p>Deixe ${os} <b>soltos</b> e coloque o controle parado na mesa. O controle mede o ponto de descanso sozinho em poucos segundos.</p>`
    : `<p>São 4 passos. Em cada um você empurra ${os} para um canto, solta e toca em <b>Continuar</b>.</p>`;
  if (!await confirmDlg("Calibrar o centro", intro + `<div class="alert warn">Depois de começar, não feche a página nem tire o cabo até terminar.</div>`, "Começar")) return;
  busy = true;
  const dev = hid;
  try {
    if (quick) {
      showDlg(`<h3>Calibrando o centro…</h3><p class="sub">Não toque nos analógicos.</p><div class="prog"><i id="cp"></i></div>`);
      const prog = (v) => { const el = $("cp"); if (el) el.style.width = v + "%"; };
      prog(10); await sleep(600); await dev.centerBegin(); prog(30);
      for (let i = 0; i < 5; i++) { await sleep(150); await dev.centerSample(); prog(30 + (i + 1) * 12); }
      await dev.centerEnd(); prog(100);
    } else {
      await dev.centerBegin();
      const corners = [["↖", "canto de cima, à esquerda"], ["↗", "canto de cima, à direita"], ["↙", "canto de baixo, à esquerda"], ["↘", "canto de baixo, à direita"]];
      for (let i = 0; i < 4; i++) {
        showDlg(`<h3>Passo ${i + 1} de 4</h3>${steps(4, i)}<div class="arrow" aria-hidden="true">${corners[i][0]}</div><p>Empurre ${os} até o <b>${corners[i][1]}</b> e solte. Quando ${one ? "ele voltar" : "eles voltarem"} ao centro, toque em Continuar.</p><div class="acts"><button class="b p" id="cNext">Continuar</button></div>`);
        $("cNext").focus();
        await waitClick("cNext");
        $("cNext").disabled = true; $("cNext").innerHTML = '<span class="spin"></span>Lendo…';
        await sleep(150);
        await dev.centerSample();
      }
      await sleep(200);
      await dev.centerEnd();
    }
    busy = false;
    addLog("Centro calibrado (temporário)");
    setUnsaved(true);
    showMsg("Centro calibrado", "Teste os analógicos na aba <b>Controle</b>. Ficou bom? Toque em <b>Salvar no controle</b>. Não gostou? Toque em <b>Desfazer</b>.");
  } catch (e) { failMsg(e); }
}

async function rangeWizard() {
  if (!hid || busy || calibBlock()) return;
  const one = hid.model.sticks === 1;
  const intro = `<p>Gire ${one ? "o analógico" : "os dois analógicos"} <b>devagar, encostando na borda</b>: pelo menos 2 voltas para um lado e 2 para o outro.</p><div class="alert warn">Se tocar em Concluir sem girar, a calibração fica incompleta e você precisa repetir.</div>`;
  if (!await confirmDlg("Calibrar o alcance", intro, "Começar")) return;
  busy = true;
  const dev = hid, N = 48, need = 4;
  const fill = { L: new Array(N).fill(0), R: new Array(N).fill(0) }, cyc = { L: 0, R: 0 };
  showDlg(`<h3>Gire os analógicos</h3><p class="sub">O controle está medindo. Continue girando mesmo se a barra parar.</p>
    <div class="dlgsticks"><canvas id="rL" width="280" height="280"></canvas>${one ? "" : '<canvas id="rR" width="280" height="280"></canvas>'}</div>
    <div class="prog"><i id="rp"></i></div><div class="sub" id="rt">0%</div>
    <div class="acts"><button class="b p" id="rDone" disabled>Concluir</button></div>`);
  let running = true, secs = 15, pct = 0;
  try {
    await sleep(500);
    await dev.rangeBegin();
  } catch (e) { running = false; failMsg(e); return; }
  const tick = setInterval(() => { secs--; refreshBtn(); }, 1000);
  function refreshBtn() {
    const b = $("rDone"); if (!b) return;
    const ready = secs <= 0 || pct >= 100;
    b.disabled = !ready; b.textContent = ready ? "Concluir" : `Concluir (${secs})`;
  }
  function frame() {
    if (!running || hid !== dev) { clearInterval(tick); return; }
    for (const [k, x, y] of [["L", S.lx, S.ly], ["R", S.rx, S.ry]]) {
      if (one && k === "R") continue;
      const d = Math.hypot(x, y), i = (Math.round(Math.atan2(y, x) * N / 2 / Math.PI) + N) % N;
      fill[k][i] = Math.max(fill[k][i], d);
      if (fill[k].filter((v) => v > 0.8).length / N >= 0.95) { cyc[k]++; fill[k].fill(0); }
    }
    const part = (k) => Math.min(50, Math.min(1, cyc[k] / need) * 50 + fill[k].filter((v) => v > 0.8).length / N * (50 / need));
    pct = Math.round(one ? Math.min(100, 2 * part("L")) : part("L") + part("R"));
    const rp = $("rp"); if (rp) rp.style.width = pct + "%";
    const rt = $("rt"); if (rt) rt.textContent = `${pct}% · voltas: esquerdo ${Math.min(cyc.L, need)}/${need}` + (one ? "" : ` · direito ${Math.min(cyc.R, need)}/${need}`);
    const cl = $("rL"); if (cl) drawStick(cl, S.lx, S.ly, fill.L);
    const cr = $("rR"); if (cr) drawStick(cr, S.rx, S.ry, fill.R);
    refreshBtn();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  await waitClick("rDone");
  running = false; clearInterval(tick);
  $("rDone").disabled = true; $("rDone").innerHTML = '<span class="spin"></span>Gravando…';
  try {
    await dev.rangeEnd();
    busy = false;
    addLog("Alcance calibrado (temporário)");
    setUnsaved(true);
    showMsg("Alcance calibrado", "Gire os analógicos na aba <b>Controle</b> e veja se o círculo ficou redondo. Ficou bom? Toque em <b>Salvar no controle</b>.");
  } catch (e) { failMsg(e); }
}

async function saveCalib() {
  if (!hid || busy) return;
  const edge = hid.isEdge;
  const ok = await confirmDlg("Salvar no controle", `<p>A calibração atual fica <b>gravada de vez</b> no controle e continua depois de desligar.</p>${edge ? '<div class="alert warn">No DualSense Edge a gravação vai para os módulos dos analógicos. Não tire o cabo até terminar.</div>' : ""}`, "Salvar", "ok");
  if (!ok) return;
  busy = true;
  const dev = hid;
  showDlg(`<h3>Salvando…</h3><p class="sub">Não tire o cabo.</p><div class="prog"><i id="sp"></i></div>`);
  try {
    await dev.save((v) => { const el = $("sp"); if (el) el.style.width = v + "%"; });
    busy = false;
    if (hidInfo) hidInfo.nv = await dev.nvStatus();
    setUnsaved(false);
    addLog("Calibração salva no controle");
    showMsg("Salvo", "A calibração ficou gravada no controle." + (edge ? " Se ela não continuar depois de reiniciar, confira as soldas dos módulos." : ""));
  } catch (e) { failMsg(e); }
}
async function undoCalib() {
  if (!hid || busy) return;
  if (!await confirmDlg("Desfazer a calibração", "<p>O controle vai <b>reiniciar</b> e voltar para a última calibração salva. Ele desconecta e conecta de novo sozinho.</p>", "Reiniciar o controle")) return;
  closeDlg();
  setUnsaved(false);
  addLog("Reiniciando o controle");
  await hid.reboot();
  toast("Reiniciando o controle… se ele não voltar sozinho, tire e ligue o cabo.", "", 7000);
}
$("btnCenter").onclick = centerWizard; $("btnRange").onclick = rangeWizard; $("btnSave").onclick = saveCalib; $("btnUndo").onclick = undoCalib;

// ============ ferramentas: luzes, motores, gatilhos, som
async function act(fn) {
  if (!hid || busy) return;
  try { await fn(); } catch (e) { toast("O controle não aceitou o comando: " + e.message, "bad"); }
}
const COLORS = [["Azul MeoWDeV", "#2f80ff"], ["Ciano", "#59c8ff"], ["Branco", "#ffffff"], ["Vermelho", "#ff2030"], ["Verde", "#20ff70"], ["Roxo", "#9a40ff"], ["Laranja", "#ff8a1a"], ["Rosa", "#ff4fb0"], ["Apagada", "#000000"]];
for (const [name, c] of COLORS) {
  const b = document.createElement("button"); b.className = "sw"; b.style.background = c; b.title = name; b.setAttribute("aria-label", "Luz " + name);
  b.onclick = () => act(() => hid.light(...rgb(c)));
  $("swatches").appendChild(b);
}
const pick = document.createElement("input"); pick.type = "color"; pick.value = "#2f80ff"; pick.setAttribute("aria-label", "Escolher outra cor");
pick.oninput = () => act(() => hid.light(...rgb(pick.value)));
$("swatches").appendChild(pick);
let ledMask = 0;
for (let i = 0; i < 5; i++) {
  const b = document.createElement("button"); b.className = "led"; b.setAttribute("aria-label", "LED " + (i + 1)); b.setAttribute("aria-pressed", "false");
  b.onclick = () => act(async () => { ledMask ^= 1 << i; await hid.playerLeds(ledMask); b.classList.toggle("on", !!(ledMask & (1 << i))); b.setAttribute("aria-pressed", String(!!(ledMask & (1 << i)))); });
  $("leds").appendChild(b);
}
$("muteSel").onchange = () => act(() => hid.muteLed(+$("muteSel").value));
const trig = () => act(() => hid.triggers($("trigL").value, $("trigR").value));
$("trigL").onchange = trig; $("trigR").onchange = trig;
for (const id of ["mL", "mR"]) $(id).oninput = () => { $(id + "v").textContent = Math.round($(id).value / 255 * 100) + "%"; };
const pulse = (l, r) => act(async () => { await hid.rumble(l, r); await sleep(700); if (hid) await hid.rumble(0, 0); });
$("btnMotorL").onclick = () => pulse(+$("mL").value, 0);
$("btnMotorR").onclick = () => pulse(0, +$("mR").value);
$("btnMotorB").onclick = () => pulse(+$("mL").value, +$("mR").value);
const beep = (where) => act(async () => { await hid.speaker(where); await sleep(1000); if (hid) await hid.speakerOff(); });
$("btnSpk").onclick = () => beep("speaker"); $("btnHp").onclick = () => beep("headphones");

function renderTools() {
  const on = !!hid;
  $("toolsOff").classList.toggle("hidden", on);
  $("toolsOn").classList.toggle("hidden", !on);
  if (!on) return;
  const k = hid.key, ds5 = k === "DS5" || k === "EDGE";
  const dl = (list) => list.map(([a, b, c]) => `<dt>${esc(a)}</dt><dd class="${c || ""}">${esc(b)}</dd>`).join("");
  const base = [["Modelo", hid.model.name], ...(hidInfo ? hidInfo.items : [["Informações", "não foi possível ler", "bad"]])];
  if (S.battery) base.push(["Bateria", batteryTxt(S.battery).replace("Bateria ", "")]);
  $("infoList").innerHTML = dl(base);
  $("infoExtra").innerHTML = dl(hidInfo?.extra || []);
  $("infoMore").classList.toggle("hidden", !hidInfo?.extra?.length);
  const block = calibBlock();
  $("calibBlock").textContent = block; $("calibBlock").classList.toggle("hidden", !block);
  $("btnCenter").disabled = $("btnRange").disabled = !!block;
  $("centerDesc").textContent = ds5 ? "Automática: deixe os analógicos soltos por alguns segundos." : "Em 4 passos: você empurra os analógicos para cada canto e solta.";
  if (hid.isVr2 && !block) { $("calibBlock").textContent = "Suporte ao PS VR2 é experimental: calibre só se precisar e teste bem antes de salvar."; $("calibBlock").className = "alert warn"; }
  else $("calibBlock").className = "alert bad" + (block ? "" : " hidden");
  const un = isUnsaved();
  $("unsaved").classList.toggle("hidden", !un);
  const nv = hidInfo?.nv;
  const NV = { locked: ["Protegida", "ok", "Calibrações novas ficam temporárias até você salvar."], unlocked: ["Liberada", "warn", "O controle está gravando direto. Desligue e ligue o cabo para proteger."], pending_reboot: ["Reiniciar", "bad", "O controle precisa reiniciar."], unknown: ["Desconhecida", "", "O controle não informou o estado."], error: ["Erro", "bad", "Não consegui ler o estado."] };
  const [lbl, cls, txt] = NV[nv] || ["—", "", "Sem informação."];
  $("nvBadge").textContent = lbl; $("nvBadge").className = "badge " + cls; $("nvDesc").textContent = txt;
  $("cardMotors").classList.toggle("hidden", !hid.hasHaptics);
  $("cardLight").classList.toggle("hidden", hid.isVr2);
  $("ledsRow").classList.toggle("hidden", !ds5); $("muteRow").classList.toggle("hidden", !ds5);
  $("cardTrig").classList.toggle("hidden", !ds5); $("cardAudio").classList.toggle("hidden", !ds5);
}

// ============ laço principal
let lastSlow = 0;
function loop(t) {
  if (src !== "hid" && !connecting) pollPad();
  if (src) {
    for (const n of S.pressed) if (!tested.has(n)) { tested.add(n); addLog((LABELS[n] || n) + " testado"); }
    if (S.l2 > 0.02) tested.add("l2"); if (S.r2 > 0.02) tested.add("r2");
    maxTrig.l2 = Math.max(maxTrig.l2, S.l2); maxTrig.r2 = Math.max(maxTrig.r2, S.r2);
    stickStep("L", S.lx, S.ly);
    if (model.sticks === 2) stickStep("R", S.rx, S.ry);
  }
  if (view === "ds5") drawDs5(); else if (view === "ds4") drawDs4();
  drawChips();
  $("bL2").style.width = S.l2 * 100 + "%"; $("vL2").textContent = Math.round(S.l2 * 100) + "%";
  $("bR2").style.width = S.r2 * 100 + "%"; $("vR2").textContent = Math.round(S.r2 * 100) + "%";
  const sensors = src === "hid" && !!S.imu;
  $("cardSensors").classList.toggle("hidden", !sensors);
  if (sensors) { drawTouch(); drawImu(); }
  const stops = S.stopL2 !== null;
  $("stops").classList.toggle("hidden", !stops);
  if (stops) $("stops").textContent = `Trava do gatilho (Edge): L2 nível ${S.stopL2} · R2 nível ${S.stopR2}`;
  if (t - lastSlow > 150) { lastSlow = t; renderVal(); renderStatus(); if (hid && !busy && !$("pageTools").classList.contains("hidden")) renderInfoBattery(); }
  requestAnimationFrame(loop);
}
let lastBat = "";
function renderInfoBattery() { const b = batteryTxt(S.battery); if (b !== lastBat) { lastBat = b; renderTools(); } }

setModel(MODELS.DS5);
drawStick($("cvL"), 0, 0, sectors.L); drawStick($("cvR"), 0, 0, sectors.R);
usbHint(); renderStatus(); renderTools(); renderLast(); renderVal();
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
