"use strict";
import { MODELS, HID_FILTERS, GAMEPAD_ORDER, buttonsOf, modelFromGamepadId, parseInput, HidPad, circularity, TOUCH_W, TOUCH_H } from "./protocol.js";
import { t, LANGS, getLang, setLang, applyI18n } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const HAS_HID = "hid" in navigator;
const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const store = {
  get(k) { try { return localStorage.getItem("ps5web." + k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem("ps5web." + k) : localStorage.setItem("ps5web." + k, v); } catch { /* modo privado */ } },
};
const L = (n) => t("btn." + n);
const modelName = (m) => m.side ? `${m.name} · ${t("side." + m.side)}` : m.name;
const val = (v) => (v && typeof v === "object") ? t(v.t) : v;
const errMsg = (e) => e?.key ? t(e.key) + (e.detail ? " " + e.detail : "") : (e?.message || String(e));

// ============ idioma e tema
const langSel = $("langSel");
for (const [code, name] of LANGS) { const o = document.createElement("option"); o.value = code; o.textContent = name; langSel.appendChild(o); }
langSel.value = getLang();
langSel.onchange = () => { setLang(langSel.value); refreshTexts(); };
const isDark = () => { const th = document.documentElement.dataset.theme; return th ? th === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
$("themeBtn").onclick = () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next; store.set("theme", next);
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#0c0920" : "#f4f1ff";
  readColors();
};
let CV = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["grid", "trail", "fill", "dot", "touch"]) CV[k] = cs.getPropertyValue("--cv-" + k).trim();
  CV.ok = cs.getPropertyValue("--ok").trim(); CV.accent = cs.getPropertyValue("--accent2").trim();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readColors);
readColors();

// ============ estado ao vivo (vem do Bluetooth/Gamepad API ou do USB)
const S = { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, pressed: new Set(), imu: null, touches: [], battery: null, stopL2: null, stopR2: null };
let src = null;          // "pad" = modo básico, "hid" = USB modo completo
let model = null;
let unknownPad = false;
let padIndex = null, padId = "", padStandard = true;
let hid = null, hidInfo = null, wantHid = false, connecting = false, rebooting = false;
let busy = false;        // calibração em andamento
let onVal = false;
let screen = "gate";     // gate | app

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
  log.unshift(new Date().toLocaleTimeString(getLang()) + "  " + s); log = log.slice(0, 60);
  $("log").textContent = log.join("\n");
}
let toastT;
function toast(msg, kind = "", ms = 4200) {
  const el = $("toast"); el.textContent = msg; el.className = kind; clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add("hidden"), ms);
}

// ============ telas: entrada -> carregando -> testes
function showGate() {
  screen = "gate";
  $("gate").classList.remove("hidden"); $("app").classList.add("hidden"); $("nav").classList.add("hidden");
  $("gate").classList.remove("fade"); void $("gate").offsetWidth; $("gate").classList.add("fade");
  renderLast(); window.scrollTo(0, 0);
}
function showApp() {
  if (screen === "app") return;
  screen = "app";
  $("gate").classList.add("hidden"); $("app").classList.remove("hidden"); $("nav").classList.remove("hidden");
  $("app").classList.remove("fade"); void $("app").offsetWidth; $("app").classList.add("fade");
  window.scrollTo(0, 0);
}
let loadStep = 0;
function loading(on, key = "", step = 0, sub = "") {
  $("loading").classList.toggle("hidden", !on);
  if (!on) return;
  loadStep = step;
  $("loadTxt").textContent = t(key); $("loadSub").textContent = sub;
  [...$("loadDots").children].forEach((d, i) => d.classList.toggle("on", i <= step));
}
$("btnSkip").onclick = showApp;
$("brand").onclick = (e) => { e.preventDefault(); if (screen === "app") switchController(); };
$("btnSwitch").onclick = switchController;
async function switchController() {
  if (busy) return;
  if (hid) { wantHid = false; const d = hid.device; usbGone(null); try { await d.close(); } catch { /* ok */ } }
  showGate();
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
  ctx.filter = "hue-rotate(42deg) saturate(1.15)"; // contorno azul do app -> violeta da paleta
  put(idle, 0, 0, 1);
  const [lox, loy] = stickOffset(S.lx, S.ly, STICK_TRAVEL), [rox, roy] = stickOffset(S.rx, S.ry, STICK_TRAVEL);
  put(capL, 238 + lox, 359 + loy, 1); put(capR, 547 + rox, 359 + roy, 1);
  ctx.filter = "none";
  for (const p of SPRITES) {
    const n = p[0];
    const a = n === "l2" ? trigAlpha(n, S.l2) : n === "r2" ? trigAlpha(n, S.r2) : S.pressed.has(n) ? 1 : testedAlpha(n);
    const ox = n === "l3" ? lox : n === "r3" ? rox : 0, oy = n === "l3" ? loy : n === "r3" ? roy : 0;
    put(p.img, p[1] + ox, p[2] + oy, a);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 6;
  if (stickDone.L) { ctx.beginPath(); ctx.arc(284, 405, 69, 0, 7); ctx.stroke(); }
  if (stickDone.R) { ctx.beginPath(); ctx.arc(593, 405, 69, 0, 7); ctx.stroke(); }
  ctx.fillStyle = "#f3f0ff"; ctx.font = "bold 24px system-ui,sans-serif"; ctx.textAlign = "center";
  ctx.fillText("L2 " + Math.round(S.l2 * 100) + "%", 153, 66); ctx.fillText("R2 " + Math.round(S.r2 * 100) + "%", 723, 66);
}

// ============ desenho do DualShock 4 (SVG do dualshock-tools, licença MIT) — sempre no palco escuro
const SVG_IDS = { cross: "Cross", circle: "Circle", square: "Square", triangle: "Triangle", l1: "L1", r1: "R1", l2: "L2", r2: "R2", create: "Create", options: "Options", l3: "L3", r3: "R3", ps: "PS", touchpad: "Trackpad", up: "Up", down: "Down", left: "Left", right: "Right" };
const C_BODY = "#a78bfa", C_LINE = "#7c5cff", C_FILL = "#160f3a", C_PRESS = "#8b6cff", C_OK = "#4ade80";
const svgCache = new Map();
let ds4State = "none";
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(a, b, k) { const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); }
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
  } catch { ds4State = "error"; $("ds4").textContent = t("err.ds4draw"); }
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
  const mv = (g, x, y) => { const el = document.getElementById(g); if (el) el.setAttribute("transform", `translate(${(x * 25).toFixed(1)},${(y * 25).toFixed(1)})`); };
  mv("L3", S.lx, S.ly); mv("R3", S.rx, S.ry);
  for (const n of ["L2", "R2"]) {
    const el = document.getElementById(n + "_percentage"); if (!el) continue;
    const p = Math.round(S[n.toLowerCase()] * 100);
    el.textContent = p + " %"; el.setAttribute("opacity", p > 0 ? "1" : "0"); el.setAttribute("fill", "#ffffff");
  }
}

// ============ painel de botões (PS VR2 e extras do Edge)
const chipEls = new Map();
function buildChips(box, names) {
  box.innerHTML = "";
  for (const n of names) { const d = document.createElement("div"); d.className = "chip"; d.textContent = L(n); d.dataset.n = n; box.appendChild(d); chipEls.set(n, d); }
}
function drawChips() {
  for (const [n, el] of chipEls) { el.classList.toggle("down", S.pressed.has(n)); el.classList.toggle("tested", tested.has(n)); }
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
  c.strokeStyle = CV.grid; c.lineWidth = 1;
  [0.33, 0.66, 1].forEach((k) => { c.beginPath(); c.arc(r, r, (r - 6) * k, 0, 7); c.stroke(); });
  c.beginPath(); c.moveTo(6, r); c.lineTo(s - 6, r); c.moveTo(r, 6); c.lineTo(r, s - 6); c.stroke();
  const n = sec.length;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = ((i % n) + 0.5) / n * Math.PI * 2, m = Math.min(sec[i % n], 1) * (r - 6);
    const px = r + Math.cos(a) * m, py = r + Math.sin(a) * m;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fillStyle = CV.fill; c.fill(); c.strokeStyle = CV.trail; c.lineWidth = 2; c.stroke();
  const px = r + x * (r - 6), py = r + y * (r - 6);
  c.beginPath(); c.arc(px, py, Math.max(5, s / 27), 0, 7); c.fillStyle = CV.dot; c.fill();
}
function stickStep(key, x, y) {
  const m = Math.hypot(x, y);
  if (m > 0.25) {
    const s = Math.floor(((Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 36) % 36;
    sectors[key][s] = Math.max(sectors[key][s], m);
  }
  if (m < 0.2) drift[key] = drift[key] === null ? m : Math.min(drift[key], m);
  if (m > 0.9) stickDone[key] = true;
  drawStick($(key === "L" ? "cvL" : "cvR"), x, y, sectors[key]);
  $(key === "L" ? "numL" : "numR").textContent = `X ${x.toFixed(2)}  Y ${y.toFixed(2)}  |${m.toFixed(2)}|`;
}

// ============ touchpad e giroscópio (só USB)
function drawTouch() {
  const cv = $("touch"), c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = CV.grid; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  const now = performance.now();
  while (trail.length && now - trail[0].t > 900) trail.shift();
  for (const p of trail) {
    c.globalAlpha = (1 - (now - p.t) / 900) * 0.55;
    c.fillStyle = p.id % 2 ? CV.ok : CV.accent;
    c.beginPath(); c.arc(p.x / TOUCH_W * w, p.y / TOUCH_H * h, 5, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  for (const p of S.touches) { c.fillStyle = CV.touch; c.beginPath(); c.arc(p.x / TOUCH_W * w, p.y / TOUCH_H * h, 10, 0, 7); c.fill(); }
  $("touchTxt").textContent = S.touches.length ? S.touches.map((p, i) => t("touch.finger", { n: i + 1, x: p.x, y: p.y })).join("  ") : t("touch.hint");
}
function drawImu() {
  const i = S.imu; if (!i) return;
  const f = (v) => (v >= 0 ? " " : "") + v.toFixed(1);
  const g = Math.hypot(i.ax, i.ay, i.az);
  $("imu").innerHTML = `<b>${t("imu.gyro")}</b> (°/s)<br>X ${f(i.gx)} · Y ${f(i.gy)} · Z ${f(i.gz)}<br><b>${t("imu.accel")}</b> (g)<br>X ${f(i.ax)} · Y ${f(i.ay)} · Z ${f(i.az)}<br>${t("imu.total")} ${g.toFixed(2)} g ${g > 0.85 && g < 1.15 ? t("imu.rest") : ""}<br>${t("imu.max")} ${gyroMax.toFixed(0)}°/s`;
}

// ============ status
function batteryTxt(b) {
  if (!b) return "";
  if (b.error) return t("bat.error");
  return t("bat.level", { n: b.level }) + (b.charging ? " ⚡ " + t("bat.charging") : b.cable && b.level === 100 ? " · " + t("bat.full") : "");
}
let lastPills = "";
function renderStatus() {
  const on = src !== null;
  $("dot").className = "dot" + (src === "hid" ? " hid" : on ? " on" : "");
  if (!on) { $("stTitle").textContent = t("st.none"); $("stSub").textContent = t("st.noneSub"); }
  else if (src === "hid") {
    $("stTitle").textContent = t("st.connected", { m: modelName(model) });
    const bits = [hidInfo?.color && t("color." + hidInfo.color), hidInfo?.board, hidInfo?.serial && t("st.serial", { s: hidInfo.serial })].filter(Boolean);
    $("stSub").textContent = bits.join(" · ") || t("st.usb");
  } else {
    $("stTitle").textContent = t("st.connected", { m: unknownPad ? t("st.controller") : modelName(model) });
    $("stSub").textContent = padId + (padStandard ? "" : " · " + t("st.nonStd"));
  }
  const pills = [];
  if (src === "hid") pills.push(`<span class="badge info">${t("pill.usb")}</span>`);
  if (src === "pad") pills.push(`<span class="badge">${t("pill.basic")}</span>`);
  if (src === "hid" && hidInfo?.clone) pills.push(`<span class="badge bad">${t("pill.clone")}</span>`);
  if (src === "hid" && isUnsaved()) pills.push(`<span class="badge warn">${t("pill.unsaved")}</span>`);
  if (S.battery) pills.push(`<span class="badge">${esc(batteryTxt(S.battery))}</span>`);
  const html = pills.join("");
  if (html !== lastPills) { $("pills").innerHTML = html; lastPills = html; }
  $("btnUsbApp").classList.toggle("hidden", !HAS_HID || src === "hid");
  $("btnUsbOff").classList.toggle("hidden", src !== "hid");
  $("btnUsbApp").disabled = $("btnUsb").disabled = connecting;
  notice();
}
function notice() {
  let h = "";
  if (!src) h = t("n.none");
  else if (src === "pad") {
    if (!padStandard) h = t("n.nonStd");
    else if (unknownPad) h = t("n.unknown");
    else if (model.key === "VR2L" || model.key === "VR2R") h = t("n.vr2");
    else if (HAS_HID) h = t("n.upgrade");
  }
  if ($("notice").innerHTML !== h) $("notice").innerHTML = h;
}
function usbHint() {
  $("usbHint").textContent = HAS_HID ? t("hint.ok") : MOBILE ? t("hint.mobile") : t("hint.browser");
  $("hidSupport").innerHTML = HAS_HID ? t("sup.ok") : "<b>" + t("sup.no") + "</b> " + (MOBILE ? t("hint.mobile") : t("hint.browser"));
  $("btnUsb").disabled = $("btnUsb2").disabled = !HAS_HID;
}

// ============ última conexão e calibração não salva
const unsavedKey = () => hidInfo?.serial ? "unsaved." + hidInfo.serial : null;
const isUnsaved = () => { const k = unsavedKey(); return !!k && store.get(k) === "1"; };
function setUnsaved(v) { const k = unsavedKey(); if (k) store.set(k, v ? "1" : null); renderTools(); }
function renderLast() {
  let info = null; try { info = JSON.parse(store.get("last") || "null"); } catch { /* ignora */ }
  if (!info) { $("gateLast").innerHTML = ""; return; }
  const m = MODELS[info.key];
  const bits = [info.color && t("color." + info.color), info.board, m ? modelName(m) : ""].filter(Boolean).join(" ");
  const warn = info.serial && store.get("unsaved." + info.serial) === "1";
  $("gateLast").innerHTML = `${t("last.t")} <b>${esc(bits)}</b>${info.serial ? ", " + esc(t("st.serial", { s: info.serial })) : ""}` +
    (warn ? `<div class="warnline">${t("last.unsaved")}</div>` : "");
}

// ============ Bluetooth / Gamepad API (modo básico)
function readPad() {
  const list = (navigator.getGamepads && navigator.getGamepads()) || [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}
window.addEventListener("gamepadconnected", (e) => addLog(t("log.connected", { id: e.gamepad.id })));
window.addEventListener("gamepaddisconnected", () => addLog(t("log.disconnected")));
function pollPad() {
  const g = readPad();
  if (!g) {
    if (src === "pad") { src = null; padIndex = null; clearLive(); renderStatus(); }
    return;
  }
  if (src !== "pad" || padIndex !== g.index) { addLog(t("log.reading", { id: g.id })); src = "pad"; padIndex = g.index; }
  padId = g.id; padStandard = g.mapping === "standard";
  const m = modelFromGamepadId(g.id);
  setModel(m || MODELS.DS5, !m);
  S.pressed.clear();
  g.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && GAMEPAD_ORDER[i]) S.pressed.add(GAMEPAD_ORDER[i]); });
  S.lx = g.axes[0] || 0; S.ly = g.axes[1] || 0; S.rx = g.axes[2] || 0; S.ry = g.axes[3] || 0;
  S.l2 = g.buttons[6] ? g.buttons[6].value : 0; S.r2 = g.buttons[7] ? g.buttons[7].value : 0;
  S.imu = null; S.touches = []; S.battery = null;
  if (screen === "gate" && !connecting) { toast(t("toast.padIn", { m: unknownPad ? t("st.controller") : modelName(model) }), "ok"); showApp(); }
}
function clearLive() {
  S.pressed.clear(); S.lx = S.ly = S.rx = S.ry = S.l2 = S.r2 = 0; S.imu = null; S.touches = []; S.battery = null; S.stopL2 = S.stopR2 = null;
}

// ============ USB (WebHID): modo completo
async function connectUsb() {
  if (!HAS_HID) { toast(t("hint.browser"), "bad"); return; }
  if (connecting || hid) return;
  let dev;
  // sempre abre a janela do navegador para a pessoa escolher o controle
  try { dev = (await navigator.hid.requestDevice({ filters: HID_FILTERS }))[0]; }
  catch (e) { toast(t("err.chooser") + " " + e.message, "bad"); return; }
  if (!dev) return; // a pessoa cancelou
  await openDevice(dev);
}
async function openDevice(dev) {
  connecting = true; renderStatus();
  loading(true, rebooting ? "load.reboot" : "load.open", 0, dev.productName || "");
  try {
    if (dev.opened) { await dev.close(); await sleep(300); }
    await dev.open();
  } catch {
    connecting = false; rebooting = false; loading(false); renderStatus();
    toast(t("err.busy"), "bad", 7000);
    return;
  }
  let first = true;
  dev.oninputreport = (e) => {
    if (!first) return;
    first = false; dev.oninputreport = null;
    setupDevice(dev, e.data).catch(async (err) => {
      connecting = false; rebooting = false; loading(false); renderStatus();
      toast(t("err.connect") + " " + errMsg(err), "bad", 7000); addLog("✖ " + errMsg(err));
      try { await dev.close(); } catch { /* já fechado */ }
    });
  };
  setTimeout(() => {
    if (first && connecting) { connecting = false; rebooting = false; loading(false); renderStatus(); toast(t("err.noInput"), "bad"); dev.close().catch(() => {}); }
  }, 3000);
}
async function setupDevice(dev, data) {
  if (data.byteLength !== 63) {
    await dev.close();
    connecting = false; rebooting = false; loading(false); renderStatus();
    toast(t("err.bluetooth"), "", 8000);
    return;
  }
  const p = new HidPad(dev);
  loading(true, "load.info", 1, modelName(p.model));
  let info = null;
  try { info = await p.info(); } catch (e) { addLog("✖ " + errMsg(e)); }
  if (info && !info.clone) await p.initOutput();
  if (info?.nv === "unlocked") { try { await p.nvLock(); info.nv = await p.nvStatus(); } catch { /* segue */ } }
  loading(true, "load.ready", 2, modelName(p.model));
  hid = p; hidInfo = info; wantHid = true;
  src = "hid"; clearLive(); setModel(p.model);
  dev.oninputreport = onReport;
  if (info) store.set("last", JSON.stringify({ key: p.key, serial: info.serial, board: info.board, color: info.color, when: Date.now() }));
  addLog("USB: " + modelName(p.model) + (info?.serial ? " · " + info.serial : ""));
  renderStatus(); renderTools();
  await sleep(450);
  connecting = false; rebooting = false; loading(false); showApp(); renderStatus();
  if (info?.nv === "pending_reboot") toast(t("toast.reboot"), "bad", 8000);
  else if (isUnsaved()) toast(t("toast.unsaved"), "", 7000);
  else toast(t("toast.usbIn", { m: modelName(p.model) }), "ok");
}
function onReport(e) {
  if (!hid) return;
  let r; try { r = parseInput(hid.key, e.data); } catch { return; }
  S.lx = r.lx; S.ly = r.ly; S.rx = r.rx; S.ry = r.ry; S.l2 = r.l2; S.r2 = r.r2; S.pressed = r.pressed;
  S.imu = r.imu; S.touches = r.touches; S.battery = r.battery; S.stopL2 = r.stopL2 ?? null; S.stopR2 = r.stopR2 ?? null;
  const now = performance.now();
  for (const p of r.touches) {
    trail.push({ x: p.x, y: p.y, id: p.id, t: now });
    touchSeen.minX = Math.min(touchSeen.minX, p.x); touchSeen.maxX = Math.max(touchSeen.maxX, p.x); touchSeen.n++;
  }
  if (trail.length > 400) trail.splice(0, trail.length - 400);
  if (r.imu) gyroMax = Math.max(gyroMax, Math.abs(r.imu.gx), Math.abs(r.imu.gy), Math.abs(r.imu.gz));
}
// msgKey null = saída pedida pela pessoa (sem aviso)
function usbGone(msgKey = "toast.usbOut") {
  if (!hid) return;
  hid = null; hidInfo = null;
  if (src === "hid") { src = null; clearLive(); }
  if (busy) { busy = false; showMsg(t("dlg.lostT"), t("dlg.lostD"), "bad"); }
  if (msgKey) { addLog(t(msgKey)); toast(t(msgKey)); }
  renderStatus(); renderTools();
  if (rebooting) { loading(true, "load.reboot", 0); setTimeout(() => { if (rebooting) { rebooting = false; loading(false); showGate(); toast(t("toast.rebootManual"), "", 7000); } }, 9000); }
  else if (msgKey && !readPad()) showGate();
}
if (HAS_HID) {
  navigator.hid.addEventListener("disconnect", (e) => { if (hid && e.device === hid.device) usbGone(); });
  // depois de reiniciar o controle (Desfazer), ele volta sozinho, sem pedir de novo
  navigator.hid.addEventListener("connect", (e) => { if (wantHid && !hid && !connecting && HID_FILTERS.some((f) => f.productId === e.device.productId)) setTimeout(() => openDevice(e.device), 800); });
}
$("btnUsb").onclick = connectUsb; $("btnUsb2").onclick = connectUsb; $("btnUsbApp").onclick = connectUsb;
$("btnUsbOff").onclick = async () => { wantHid = false; const d = hid?.device; usbGone(null); try { await d?.close(); } catch { /* ok */ } };

// ============ vibração rápida (aba Controle)
$("btnRumble").onclick = async () => {
  const msg = $("rumbleMsg");
  if (src === "hid") {
    if (!hid.hasHaptics) { msg.textContent = t("vib.none"); return; }
    try { await hid.rumble(255, 255); await sleep(600); await hid.rumble(0, 0); msg.textContent = t("vib.sent"); }
    catch (e) { msg.textContent = t("vib.fail") + " " + errMsg(e); }
    return;
  }
  const g = readPad();
  if (!g) { msg.textContent = t("vib.noPad"); return; }
  const act = g.vibrationActuator || (g.hapticActuators && g.hapticActuators[0]);
  if (!act) { msg.textContent = t("vib.noApi"); return; }
  try {
    if (act.playEffect) await act.playEffect("dual-rumble", { duration: 600, strongMagnitude: 1, weakMagnitude: 1 });
    else if (act.pulse) await act.pulse(1, 600);
    msg.textContent = t("vib.sent");
  } catch (e) { msg.textContent = t("vib.fail") + " " + e.message; }
};

// ============ validação
const ST = (s) => t("vs." + s);
function stickDesc(k) {
  const c = circularity(sectors[k]), cover = sectors[k].filter((m) => m > 0.15).length;
  const rest = drift[k] === null ? "" : " · " + t("v.rest", { n: drift[k].toFixed(2) }) + (drift[k] > 0.1 ? " " + t("v.drift") : "");
  return (c ? t("v.circle", { n: c.err.toFixed(1) }) : t("v.spin", { n: cover })) + rest;
}
function stickSt(k) {
  const c = circularity(sectors[k]); if (!c) return sectors[k].some((m) => m > 0.15) ? "warn" : "idle";
  if (drift[k] !== null && drift[k] > 0.1) return "bad";
  return c.err < 12 ? "ok" : "warn";
}
const trigItem = (n) => ({ id: n, t: () => t("v.trigger", { n: n.toUpperCase() }), d: () => t("v.max", { n: Math.round(maxTrig[n] * 100) }), st: () => maxTrig[n] > 0.95 ? "ok" : maxTrig[n] > 0 ? "warn" : "idle" });
const manualItem = (id, tk, dk) => ({ id, t: () => t(tk), d: () => t(dk), st: () => manual[id] || "idle", manual: true });
function items() {
  const k = model?.key || "DS5", usb = src === "hid", vr2 = k === "VR2L" || k === "VR2R";
  const req = buttonsOf(k).filter((n) => usb || !["touchpad", "mute"].includes(n));
  const list = [manualItem("usb", "v.usb", "v.usbD")];
  list.push({
    id: "btn", t: () => t("v.buttons"),
    d: () => { const f = req.filter((n) => !tested.has(n)); return f.length ? t("v.btnMissing", { a: req.length - f.length, b: req.length, list: f.map(L).join(", ") }) : t("v.btnAll") + (usb ? "" : " " + t("v.btnBrowser")); },
    st: () => req.every((n) => tested.has(n)) ? "ok" : req.some((n) => tested.has(n)) ? "warn" : "idle",
  });
  if (vr2) list.push({ id: "L", t: () => t("v.stick"), d: () => stickDesc("L"), st: () => stickSt("L") });
  else list.push({ id: "L", t: () => t("v.stickL"), d: () => stickDesc("L"), st: () => stickSt("L") }, { id: "R", t: () => t("v.stickR"), d: () => stickDesc("R"), st: () => stickSt("R") });
  if (k !== "VR2R") list.push(trigItem("l2"));
  if (k !== "VR2L") list.push(trigItem("r2"));
  if (usb && !vr2) {
    list.push({ id: "touch", t: () => t("v.touch"), d: () => touchSeen.n ? t("v.touchD", { n: Math.round((touchSeen.maxX - touchSeen.minX) / TOUCH_W * 100) }) : t("v.touchHint"),
      st: () => touchSeen.n === 0 ? "idle" : (touchSeen.maxX - touchSeen.minX) / TOUCH_W > 0.7 ? "ok" : "warn" });
    list.push({ id: "gyro", t: () => t("v.gyro"), d: () => gyroMax ? t("v.gyroD", { n: gyroMax.toFixed(0) }) : t("v.gyroHint"), st: () => gyroMax > 150 ? "ok" : gyroMax > 20 ? "warn" : "idle" });
  }
  if (!vr2) list.push(manualItem("vib", "v.vib", usb ? "v.vibUsb" : "v.vibD"));
  if (usb && !vr2) list.push(manualItem("light", "v.light", "v.lightD"));
  if (usb && (k === "DS5" || k === "EDGE")) list.push(manualItem("spk", "v.spk", "v.spkD"));
  return list;
}
let ITEMS = [], rows = [];
function buildVal() {
  const sig = (model?.key || "-") + src + getLang();
  if (sig === valSig) return;
  valSig = sig; ITEMS = items();
  $("valList").innerHTML = "";
  rows = ITEMS.map((it) => {
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<div><div class="t">${esc(it.t())}</div><div class="d"></div>${it.manual ? `<div class="acts"><button class="b sm" data-v="ok">${t("v.pass")}</button><button class="b sm" data-v="fail">${t("v.fail")}</button></div>` : ""}</div><span class="badge"></span>`;
    r.querySelectorAll("[data-v]").forEach((b) => { b.onclick = () => { manual[it.id] = b.dataset.v; addLog(it.t() + ": " + ST(b.dataset.v)); renderVal(); }; });
    $("valList").appendChild(r); return r;
  });
}
function renderVal() {
  buildVal();
  let ok = 0;
  ITEMS.forEach((it, i) => {
    const s = it.st(); if (s === "ok") ok++;
    rows[i].querySelector(".d").textContent = it.d();
    const b = rows[i].querySelector(".badge"); b.textContent = ST(s); b.className = "badge " + (s === "idle" ? "" : s === "fail" ? "bad" : s);
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
function showMsg(title, html, kind = "ok") {
  showDlg(`<h3>${esc(title)}</h3><div class="alert ${kind === "bad" ? "bad" : ""}">${html}</div><div class="acts"><button class="b p" id="dlgOk">${t("dlg.ok")}</button></div>`);
  $("dlgOk").onclick = closeDlg; $("dlgOk").focus();
}
function confirmDlg(title, html, okLabel, cls = "p") {
  return new Promise((res) => {
    showDlg(`<h3>${esc(title)}</h3>${html}<div class="acts"><button class="b ${cls}" id="dlgYes">${esc(okLabel)}</button><button class="b" id="dlgNo">${t("dlg.cancel")}</button></div>`);
    const done = (v) => { dlg.removeEventListener("close", onClose); res(v); };
    const onClose = () => done(false);
    dlg.addEventListener("close", onClose);
    $("dlgYes").onclick = () => done(true);
    $("dlgNo").onclick = closeDlg;
    $("dlgNo").focus();
  });
}
const waitClick = (id) => new Promise((res) => { $(id).onclick = () => res(); });
const stepsBar = (n, cur) => `<div class="steps">${Array.from({ length: n }, (_, i) => `<i class="${i < cur ? "done" : i === cur ? "on" : ""}"></i>`).join("")}</div>`;
function failMsg(e) {
  busy = false;
  showMsg(t("dlg.failT"), esc(errMsg(e)) + "<br><br>" + t("dlg.failD"), "bad");
  addLog("✖ " + errMsg(e));
}

// ============ calibração
function calibBlock() {
  if (!hidInfo) return t("cb.noInfo");
  if (hidInfo.clone) return t("cb.clone");
  if (hidInfo.oldFw) return t("cb.oldFw");
  if (hidInfo.nv === "pending_reboot") return t("cb.reboot");
  return "";
}
async function centerWizard() {
  if (!hid || busy || calibBlock()) return;
  const quick = hid.key === "DS5" || hid.key === "EDGE", one = hid.model.sticks === 1;
  const os = t(one ? "c.one" : "c.both");
  const intro = `<p>${t(quick ? "c.introQuick" : "c.intro4", { s: os })}</p>`;
  if (!await confirmDlg(t("c.title"), intro + `<div class="alert warn">${t("c.dontClose")}</div>`, t("c.start"))) return;
  busy = true;
  const dev = hid;
  try {
    if (quick) {
      showDlg(`<h3>${t("c.running")}</h3><p class="sub">${t("c.noTouch")}</p><div class="prog"><i id="cp"></i></div>`);
      const prog = (v) => { const el = $("cp"); if (el) el.style.width = v + "%"; };
      prog(10); await sleep(600); await dev.centerBegin(); prog(30);
      for (let i = 0; i < 5; i++) { await sleep(150); await dev.centerSample(); prog(30 + (i + 1) * 12); }
      await dev.centerEnd(); prog(100);
    } else {
      await dev.centerBegin();
      const corners = [["↖", "c.tl"], ["↗", "c.tr"], ["↙", "c.bl"], ["↘", "c.br"]];
      for (let i = 0; i < 4; i++) {
        showDlg(`<h3>${t("c.step", { n: i + 1 })}</h3>${stepsBar(4, i)}<div class="arrow" aria-hidden="true">${corners[i][0]}</div><p>${t(one ? "c.pushOne" : "c.pushBoth", { c: t(corners[i][1]) })}</p><div class="acts"><button class="b p" id="cNext">${t("c.next")}</button></div>`);
        $("cNext").focus();
        await waitClick("cNext");
        $("cNext").disabled = true; $("cNext").innerHTML = `<span class="spin"></span>${t("c.reading")}`;
        await sleep(150);
        await dev.centerSample();
      }
      await sleep(200);
      await dev.centerEnd();
    }
    busy = false;
    addLog(t("log.center"));
    setUnsaved(true);
    showMsg(t("c.doneT"), t("c.doneD"));
  } catch (e) { failMsg(e); }
}

async function rangeWizard() {
  if (!hid || busy || calibBlock()) return;
  const one = hid.model.sticks === 1;
  const intro = `<p>${t("r.intro", { s: t(one ? "c.one" : "c.both") })}</p><div class="alert warn">${t("r.warn")}</div>`;
  if (!await confirmDlg(t("r.title"), intro, t("c.start"))) return;
  busy = true;
  const dev = hid, N = 48, need = 4;
  const fill = { L: new Array(N).fill(0), R: new Array(N).fill(0) }, cyc = { L: 0, R: 0 };
  showDlg(`<h3>${t("r.spin")}</h3><p class="sub">${t("r.keep")}</p>
    <div class="dlgsticks"><canvas id="rL" width="280" height="280"></canvas>${one ? "" : '<canvas id="rR" width="280" height="280"></canvas>'}</div>
    <div class="prog"><i id="rp"></i></div><div class="sub" id="rt">0%</div>
    <div class="acts"><button class="b p" id="rDone" disabled>${t("r.done")}</button></div>`);
  let running = true, secs = 15, pct = 0;
  try { await sleep(500); await dev.rangeBegin(); } catch (e) { running = false; failMsg(e); return; }
  const tick = setInterval(() => { secs--; refreshBtn(); }, 1000);
  function refreshBtn() {
    const b = $("rDone"); if (!b) return;
    const ready = secs <= 0 || pct >= 100;
    b.disabled = !ready; b.textContent = ready ? t("r.done") : `${t("r.done")} (${secs})`;
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
    const rt = $("rt"); if (rt) rt.textContent = `${pct}% · ` + t(one ? "r.turnsOne" : "r.turns", { l: Math.min(cyc.L, need), r: Math.min(cyc.R, need), n: need });
    const cl = $("rL"); if (cl) drawStick(cl, S.lx, S.ly, fill.L);
    const cr = $("rR"); if (cr) drawStick(cr, S.rx, S.ry, fill.R);
    refreshBtn();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  await waitClick("rDone");
  running = false; clearInterval(tick);
  $("rDone").disabled = true; $("rDone").innerHTML = `<span class="spin"></span>${t("r.saving")}`;
  try {
    await dev.rangeEnd();
    busy = false;
    addLog(t("log.range"));
    setUnsaved(true);
    showMsg(t("r.doneT"), t("r.doneD"));
  } catch (e) { failMsg(e); }
}

async function saveCalib() {
  if (!hid || busy) return;
  const edge = hid.isEdge;
  if (!await confirmDlg(t("s.title"), `<p>${t("s.intro")}</p>${edge ? `<div class="alert warn">${t("s.edge")}</div>` : ""}`, t("s.btn"), "ok")) return;
  busy = true;
  const dev = hid;
  showDlg(`<h3>${t("s.running")}</h3><p class="sub">${t("s.noCable")}</p><div class="prog"><i id="sp"></i></div>`);
  try {
    await dev.save((v) => { const el = $("sp"); if (el) el.style.width = v + "%"; });
    busy = false;
    if (hidInfo) hidInfo.nv = await dev.nvStatus();
    setUnsaved(false);
    addLog(t("log.saved"));
    showMsg(t("s.doneT"), t("s.doneD") + (edge ? " " + t("s.doneEdge") : ""));
  } catch (e) { failMsg(e); }
}
async function undoCalib() {
  if (!hid || busy) return;
  if (!await confirmDlg(t("u.title"), `<p>${t("u.d")}</p>`, t("u.btn"))) return;
  closeDlg();
  setUnsaved(false);
  addLog(t("log.reboot"));
  rebooting = true;
  await hid.reboot();
}
$("btnCenter").onclick = centerWizard; $("btnRange").onclick = rangeWizard; $("btnSave").onclick = saveCalib; $("btnUndo").onclick = undoCalib;

// ============ ferramentas: luzes, motores, gatilhos, som
async function act(fn) {
  if (!hid || busy) return;
  try { await fn(); } catch (e) { toast(t("err.cmd") + " " + errMsg(e), "bad"); }
}
const COLORS = [["blue", "#7c5cff"], ["cyan", "#59c8ff"], ["white", "#ffffff"], ["red", "#ff2030"], ["green", "#20ff70"], ["purple", "#b040ff"], ["orange", "#ff8a1a"], ["pink", "#ff4fb0"], ["off", "#000000"]];
const swatchEls = [];
for (const [name, c] of COLORS) {
  const b = document.createElement("button"); b.className = "sw"; b.style.background = c;
  b.onclick = () => act(() => hid.light(...rgb(c)));
  $("swatches").appendChild(b); swatchEls.push([b, name]);
}
const pick = document.createElement("input"); pick.type = "color"; pick.value = "#7c5cff";
pick.oninput = () => act(() => hid.light(...rgb(pick.value)));
$("swatches").appendChild(pick);
let ledMask = 0;
const ledEls = [];
for (let i = 0; i < 5; i++) {
  const b = document.createElement("button"); b.className = "led"; b.setAttribute("aria-pressed", "false");
  b.onclick = () => act(async () => { ledMask ^= 1 << i; await hid.playerLeds(ledMask); const on = !!(ledMask & (1 << i)); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  $("leds").appendChild(b); ledEls.push(b);
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
  const dl = (list) => list.map(([a, b, c]) => `<dt>${esc(t(a))}</dt><dd class="${c || ""}">${esc(val(b))}</dd>`).join("");
  const base = [["info.model", modelName(hid.model)], ...(hidInfo ? hidInfo.items : [["info.title", { t: "info.fail" }, "bad"]])];
  if (S.battery) base.push(["info.battery", batteryTxt(S.battery)]);
  $("infoList").innerHTML = dl(base);
  $("infoExtra").innerHTML = dl(hidInfo?.extra || []);
  $("infoMore").classList.toggle("hidden", !hidInfo?.extra?.length);
  const block = calibBlock();
  $("btnCenter").disabled = $("btnRange").disabled = !!block;
  $("centerDesc").textContent = t(ds5 ? "cal.centerQuick" : "cal.center4");
  if (block) { $("calibBlock").textContent = block; $("calibBlock").className = "alert bad"; }
  else if (hid.isVr2) { $("calibBlock").textContent = t("cb.vr2"); $("calibBlock").className = "alert warn"; }
  else $("calibBlock").className = "alert bad hidden";
  $("unsaved").classList.toggle("hidden", !isUnsaved());
  const nv = hidInfo?.nv;
  const NV = { locked: ["ok"], unlocked: ["warn"], pending_reboot: ["bad"], unknown: [""], error: ["bad"] };
  const known = NV[nv];
  $("nvBadge").textContent = known ? t("nv." + nv) : "—"; $("nvBadge").className = "badge " + (known ? known[0] : "");
  $("nvDesc").textContent = known ? t("nv." + nv + "D") : t("nv.none");
  $("cardMotors").classList.toggle("hidden", !hid.hasHaptics);
  $("cardLight").classList.toggle("hidden", hid.isVr2);
  $("ledsRow").classList.toggle("hidden", !ds5); $("muteRow").classList.toggle("hidden", !ds5);
  $("cardTrig").classList.toggle("hidden", !ds5); $("cardAudio").classList.toggle("hidden", !ds5);
}

// ============ textos (troca de idioma)
function refreshTexts() {
  applyI18n();
  for (const [b, name] of swatchEls) { const s = t("light." + name); b.title = s; b.setAttribute("aria-label", s); }
  pick.setAttribute("aria-label", t("light.pick"));
  ledEls.forEach((b, i) => b.setAttribute("aria-label", t("light.led", { n: i + 1 })));
  for (const [n, el] of chipEls) el.textContent = L(n);
  valSig = ""; lastPills = ""; lastBat = "";
  usbHint(); renderStatus(); renderTools(); renderLast(); renderVal();
  if (!$("touchTxt").textContent || !S.touches.length) $("touchTxt").textContent = t("touch.hint");
  if (!S.imu) $("imu").textContent = t("imu.hint");
}

// ============ laço principal
let lastSlow = 0, lastBat = "";
function loop(now) {
  if (src !== "hid" && !connecting && !rebooting) pollPad();
  if (src) {
    for (const n of S.pressed) if (!tested.has(n)) { tested.add(n); addLog(t("log.tested", { b: L(n) })); }
    if (S.l2 > 0.02) tested.add("l2"); if (S.r2 > 0.02) tested.add("r2");
    maxTrig.l2 = Math.max(maxTrig.l2, S.l2); maxTrig.r2 = Math.max(maxTrig.r2, S.r2);
  }
  if (screen === "app") {
    if (src) { stickStep("L", S.lx, S.ly); if (model.sticks === 2) stickStep("R", S.rx, S.ry); }
    if (view === "ds5") drawDs5(); else if (view === "ds4") drawDs4();
    drawChips();
    $("bL2").style.width = S.l2 * 100 + "%"; $("vL2").textContent = Math.round(S.l2 * 100) + "%";
    $("bR2").style.width = S.r2 * 100 + "%"; $("vR2").textContent = Math.round(S.r2 * 100) + "%";
    const sensors = src === "hid" && !!S.imu;
    $("cardSensors").classList.toggle("hidden", !sensors);
    if (sensors) { drawTouch(); drawImu(); }
    const stops = S.stopL2 !== null;
    $("stops").classList.toggle("hidden", !stops);
    if (stops) $("stops").textContent = t("edge.stops", { l: S.stopL2, r: S.stopR2 });
    if (now - lastSlow > 150) {
      lastSlow = now; renderVal(); renderStatus();
      const b = batteryTxt(S.battery);
      if (hid && !busy && b !== lastBat) { lastBat = b; renderTools(); }
    }
  }
  requestAnimationFrame(loop);
}

setModel(MODELS.DS5);
refreshTexts();
drawStick($("cvL"), 0, 0, sectors.L); drawStick($("cvR"), 0, 0, sectors.R);
showGate();
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
