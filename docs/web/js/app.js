"use strict";
import { MODELS, HID_FILTERS, GAMEPAD_ORDER, buttonsOf, modelFromGamepadId, parseInput, HidPad, circularity, TOUCH_W, TOUCH_H } from "./protocol.js";
import { t, LANGS, getLang, setLang, applyI18n } from "./i18n.js";
import { initUI, moveSeg, themeSwitch, countTo, setRing, pop } from "./ui.js";
import { makeHistory, FINE_NAMES } from "./history.js";
import { PIX_KEY, pixPayload } from "./pix.js";
import { mountAds } from "./banners.js";

// ================================================================ utilidades
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const HAS_HID = "hid" in navigator;
const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const store = {
  get(k) { try { return localStorage.getItem("ps5web." + k); } catch { return null; } },
  set(k, v) { try { v === null ? localStorage.removeItem("ps5web." + k) : localStorage.setItem("ps5web." + k, v); } catch { /* modo privado */ } },
};
let hist; try { hist = makeHistory(localStorage); } catch { hist = makeHistory({ getItem: () => null, setItem: () => {} }); }
const L = (n) => t("btn." + n);
const modelName = (m) => m.side ? `${m.name} · ${t("side." + m.side)}` : m.name;
const val = (v) => (v && typeof v === "object") ? t(v.t) : v;
const errMsg = (e) => e?.key ? t(e.key) + (e.detail ? " " + e.detail : "") : (e?.message || String(e));
const icon = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;

// ================================================================ idioma e tema
const langSel = $("langSel");
for (const [code, name] of LANGS) { const o = document.createElement("option"); o.value = code; o.textContent = name; langSel.appendChild(o); }
langSel.value = getLang();
langSel.onchange = () => { setLang(langSel.value); refreshTexts(); };
const isDark = () => { const th = document.documentElement.dataset.theme; return th ? th === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next; store.set("theme", next);
  document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#0c0920" : "#f4f1ff";
  readColors();
});
let CV = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["grid", "trail", "fill", "dot", "touch", "l", "r"]) CV[k] = cs.getPropertyValue("--cv-" + k).trim();
  CV.ok = cs.getPropertyValue("--ok").trim(); CV.accent = cs.getPropertyValue("--accent2").trim(); CV.muted = cs.getPropertyValue("--muted").trim();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readColors);
readColors();

// ================================================================ estado ao vivo
const S = { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, pressed: new Set(), imu: null, touches: [], battery: null, stopL2: null, stopR2: null };
let src = null;          // "pad" = Bluetooth/modo básico · "hid" = USB/modo completo
let model = null, unknownPad = false;
let padIndex = null, padId = "", padStandard = true, padButtons = 0, padAxes = 0, padStamp = 0, lastPad = null;
let hid = null, hidInfo = null, wantHid = false, connecting = false, rebooting = false;
let busy = false, screen = "gate", page = "overview";
let lastRaw = null, prevRaw = null, rawFrozen = false, samples = 0, rate = 0;

// ================================================================ resultados dos testes
const tested = new Set();
const sectors = { L: new Array(36).fill(0), R: new Array(36).fill(0) };
const maxTrig = { l2: 0, r2: 0 };
const drift = { L: null, R: null };
const stickDone = { L: false, R: false };
const manual = {};
const touchSeen = { minX: Infinity, maxX: -Infinity, n: 0 };
const dust = [], lastTouch = new Map(), pathL = [], pathR = [];
const trgHist = [];
let gyroMax = 0, log = [];

function addLog(s) {
  log.unshift(new Date().toLocaleTimeString(getLang()) + "  " + s); log = log.slice(0, 80);
  $("log").textContent = log.join("\n");
}
let toastT;
const TICO = { ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', bad: '<path d="M12 7v6M12 17h.01"/>', "": '<path d="M12 11v6M12 7h.01"/>' };
function toast(msg, kind = "", ms = 4200) {
  const el = $("toast"); clearTimeout(toastT);
  el.className = "hidden"; void el.offsetWidth;
  el.innerHTML = `<span class="tico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">${TICO[kind] || TICO[""]}</svg></span><span></span><i class="tbar" aria-hidden="true"></i>`;
  el.children[1].textContent = msg;
  el.style.setProperty("--dur", ms + "ms");
  el.className = kind;
  toastT = setTimeout(() => el.classList.add("hidden"), ms);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); toast(t("copied"), "ok", 1800); } catch { toast(t("copyFail"), "bad"); }
}

// ================================================================ telas: entrada → carregando → painel
function showGate() {
  screen = "gate";
  $("gate").classList.remove("hidden"); $("gateTop").classList.remove("hidden"); $("app").classList.add("hidden");
  $("gateTop").appendChild($("tools"));
  renderLast(); window.scrollTo(0, 0);
}
function showApp() {
  if (screen === "app") return;
  screen = "app";
  $("gate").classList.add("hidden"); $("gateTop").classList.add("hidden"); $("app").classList.remove("hidden");
  $("toolsSlot").appendChild($("tools"));
  go(location.hash.slice(1) || "overview", true);
}
function loading(on, key = "", step = 0, sub = "") {
  $("loading").classList.toggle("hidden", !on);
  if (!on) return;
  $("loadTxt").textContent = t(key); $("loadSub").textContent = sub;
  [...$("loadDots").children].forEach((d, i) => d.classList.toggle("on", i <= step));
}
$("btnSkip").onclick = showApp;
$("btnSwitch").onclick = switchController;
async function switchController() {
  if (busy) return;
  if (hid) { wantHid = false; const d = hid.device; usbGone(null); try { await d.close(); } catch { /* ok */ } }
  showGate();
}

// ================================================================ navegação entre seções
const PAGES = ["overview", "live", "sticks", "calib", "out", "diag", "info", "debug", "extra"];
function go(p, silent = false) {
  if (!PAGES.includes(p)) p = "overview";
  page = p;
  for (const x of PAGES) $("pg-" + x).classList.toggle("hidden", x !== p);
  document.querySelectorAll("#snav button").forEach((b) => b.classList.toggle("on", b.dataset.page === p));
  $("pageTitle").textContent = t("pg." + p);
  $("crumb").textContent = t("pgd." + p);
  const slot = document.querySelector(`#pg-${p} .drawslot`);
  if (slot && $("drawCard").parentElement !== slot) slot.appendChild($("drawCard"));
  svgCache.clear();
  if (location.hash.slice(1) !== p) history.replaceState(null, "", "#" + p);
  renderPage();
  if (!silent) window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => { moveSeg($("stickMode")); document.querySelector("#snav button.on")?.scrollIntoView({ block: "nearest", inline: "center" }); });
}
$("snav").addEventListener("click", (e) => { const b = e.target.closest("button[data-page]"); if (b) go(b.dataset.page); });
addEventListener("hashchange", () => { if (screen === "app") go(location.hash.slice(1), true); });
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "quick") quickTest();
  else if (act === "calib") go("calib");
  else if (act === "report") makeReport();
  else if (act === "usb") connectUsb();
});
function lockedCard(key) {
  return `<span class="ico">${icon("lock")}</span><h2 style="justify-content:center;font-size:15px;text-transform:none;letter-spacing:0;color:var(--text)">${t("lock.t")}</h2><p>${t("lock." + key)}</p>` +
    (HAS_HID ? `<button class="b p magnetic" data-act="usb">${icon("usb")}<span>${t("gate.usb.btn")}</span></button>` : `<p class="sub">${MOBILE ? t("hint.mobile") : t("hint.browser")}</p>`);
}

// ================================================================ desenho do DualSense (PNG, 880 x 713)
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
const strong = () => page === "diag";
const testedAlpha = (n) => tested.has(n) ? (strong() ? STRONG_TESTED_ALPHA : TESTED_ALPHA) : 0;
function trigAlpha(n, v) { return v > 0.02 ? Math.min(1, 0.15 + 0.85 * Math.pow(v, 0.8)) : testedAlpha(n); }
function drawDs5() {
  ctx.clearRect(0, 0, 880, 713);
  ctx.filter = "hue-rotate(42deg) saturate(1.15)";
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

// ================================================================ desenho do DualShock 4 (SVG do dualshock-tools, MIT)
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
  const base = (n) => tested.has(n) ? mix(C_FILL, C_OK, strong() ? 0.55 : 0.3) : C_FILL;
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

// ================================================================ painel de botões (VR2 e extras do Edge)
const chipEls = new Map();
function buildChips(box, names) {
  box.innerHTML = "";
  for (const n of names) { const d = document.createElement("div"); d.className = "chip"; d.textContent = L(n); box.appendChild(d); chipEls.set(n, d); }
}
function drawChips() { for (const [n, el] of chipEls) { el.classList.toggle("down", S.pressed.has(n)); el.classList.toggle("tested", tested.has(n)); } }

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
  $("stickR").classList.toggle("hidden", one); $("sticks").classList.toggle("one", one); $("kR").classList.toggle("hidden", one);
  $("rowL2").classList.toggle("hidden", k === "VR2R"); $("rowR2").classList.toggle("hidden", k === "VR2L");
  svgCache.clear();
}

// ================================================================ analógicos (Normal · Zoom 10x · Circularidade)
let stickMode = "normal";
$("stickMode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-m]"); if (!b) return;
  stickMode = b.dataset.m;
  $("stickMode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  moveSeg($("stickMode"));
  $("smHelp").textContent = t("smh." + stickMode);
});
$("btnClearSticks").onclick = () => { sectors.L.fill(0); sectors.R.fill(0); pathL.length = pathR.length = 0; drift.L = drift.R = null; stickDone.L = stickDone.R = false; };

function drawStick(cv, x, y, sec, mode = "circ", path = null) {
  const c = cv.getContext("2d"), s = cv.width, r = s / 2, R = r - 8;
  c.clearRect(0, 0, s, s);
  c.strokeStyle = CV.grid; c.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((k) => { c.beginPath(); c.arc(r, r, R * k, 0, 7); c.stroke(); });
  c.beginPath(); c.moveTo(8, r); c.lineTo(s - 8, r); c.moveTo(r, 8); c.lineTo(r, s - 8); c.stroke();
  if (mode === "zoom") {
    // 10x: a borda vale 0,10. Mostra onde o analógico descansa e se passa da zona morta típica (0,05)
    const z = 10;
    c.setLineDash([5, 5]); c.strokeStyle = CV.ok; c.beginPath(); c.arc(r, r, R * 0.05 * z, 0, 7); c.stroke(); c.setLineDash([]);
    c.fillStyle = CV.muted; c.font = `${Math.round(s / 26)}px system-ui`; c.textAlign = "left";
    c.fillText("±0.10", 12, s - 12);
    const m = Math.hypot(x, y) * z, k = m > 1 ? 1 / m : 1; // fica preso na borda do círculo
    const px = r + x * z * k * R, py = r + y * z * k * R;
    c.beginPath(); c.arc(px, py, Math.max(6, s / 24), 0, 7); c.fillStyle = Math.hypot(x, y) > 0.05 ? "#f43f5e" : CV.dot; c.fill();
    return;
  }
  if (mode === "circ" && sec) {
    const n = sec.length;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = ((i % n) + 0.5) / n * Math.PI * 2, m = Math.min(sec[i % n], 1) * R;
      const px = r + Math.cos(a) * m, py = r + Math.sin(a) * m;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath(); c.fillStyle = CV.fill; c.fill(); c.strokeStyle = CV.trail; c.lineWidth = 2; c.stroke();
  }
  if (mode === "normal" && path && path.length > 1) {
    c.lineWidth = 2; c.lineCap = "round";
    for (let i = 1; i < path.length; i++) {
      c.globalAlpha = i / path.length * 0.8; c.strokeStyle = CV.dot;
      c.beginPath(); c.moveTo(r + path[i - 1][0] * R, r + path[i - 1][1] * R); c.lineTo(r + path[i][0] * R, r + path[i][1] * R); c.stroke();
    }
    c.globalAlpha = 1;
  }
  const px = r + x * R, py = r + y * R;
  c.beginPath(); c.arc(px, py, Math.max(5, s / 26), 0, 7); c.fillStyle = CV.dot; c.fill();
}
function stickTrack(key, x, y) {
  const m = Math.hypot(x, y);
  if (m > 0.25) {
    const s = Math.floor(((Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 36) % 36;
    sectors[key][s] = Math.max(sectors[key][s], m);
  }
  if (m < 0.2) drift[key] = drift[key] === null ? m : Math.min(drift[key], m);
  if (m > 0.9) stickDone[key] = true;
  const p = key === "L" ? pathL : pathR;
  p.push([x, y]); if (p.length > 40) p.shift();
}
function stickRead(k) {
  const c = circularity(sectors[k]);
  const bits = [];
  if (drift[k] !== null) bits.push(t("v.rest", { n: drift[k].toFixed(3) }) + (drift[k] > 0.1 ? " " + t("v.drift") : ""));
  bits.push(c ? t("sm.err", { n: c.err.toFixed(1) }) : t("v.spin", { n: sectors[k].filter((v) => v > 0.15).length }));
  return bits.join(" · ");
}

// ================================================================ touchpad, giroscópio, gráfico dos gatilhos
function drawTouch() {
  const cv = $("touch"), c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = "rgba(167,139,250,.14)"; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  // pó de energia: nasce no dedo, sobe solto, encolhe e some (1º dedo dourado, 2º azul)
  const seen = new Set();
  S.touches.forEach((p, n) => {
    const x = p.x / TOUCH_W * w, y = p.y / TOUCH_H * h, last = lastTouch.get(p.id), hue = n ? 195 : 45;
    seen.add(p.id);
    const dist = last ? Math.hypot(x - last.x, y - last.y) : 0, count = Math.min(14, 3 + Math.floor(dist / 5));
    for (let i = 0; i < count; i++) {
      const k = last ? Math.random() : 1, life = 34 + Math.random() * 36;
      dust.push({ x: (last ? last.x + (x - last.x) * k : x) + (Math.random() - .5) * 8, y: (last ? last.y + (y - last.y) * k : y) + (Math.random() - .5) * 8,
        vx: (Math.random() - .5) * 1.5, vy: -0.4 - Math.random() * 1.5, life, max: life, size: 3 + Math.random() * 7, hue: hue + Math.random() * 16 - 8 });
    }
    lastTouch.set(p.id, { x, y });
  });
  for (const id of lastTouch.keys()) if (!seen.has(id)) lastTouch.delete(id);
  if (dust.length > 900) dust.splice(0, dust.length - 900);
  c.globalCompositeOperation = "lighter";
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.x += d.vx; d.y += d.vy; d.vy *= 0.985; d.vx *= 0.98; d.life--;
    if (d.life <= 0) { dust.splice(i, 1); continue; }
    const f = d.life / d.max, r = d.size * (0.35 + f);
    c.fillStyle = `hsla(${d.hue},100%,${45 + f * 30}%,${f * 0.6})`;
    c.beginPath(); c.arc(d.x, d.y, r, 0, 7); c.fill();
  }
  S.touches.forEach((p, n) => {
    const x = p.x / TOUCH_W * w, y = p.y / TOUCH_H * h, g = c.createRadialGradient(x, y, 2, x, y, 34);
    g.addColorStop(0, "#fff"); g.addColorStop(.3, n ? "#7dd3fc" : "#fde047"); g.addColorStop(1, "transparent");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 34, 0, 7); c.fill();
  });
  c.globalCompositeOperation = "source-over";
  $("touchTxt").textContent = S.touches.length ? S.touches.map((p, i) => t("touch.finger", { n: i + 1, x: p.x, y: p.y })).join("  ") : t("touch.hint");
}
function drawImu() {
  const i = S.imu;
  if (!i) { $("imu").textContent = t("imu.hint"); return; }
  const f = (v) => (v >= 0 ? " " : "") + v.toFixed(1);
  const g = Math.hypot(i.ax, i.ay, i.az);
  $("imu").innerHTML = `<b>${t("imu.gyro")}</b> (°/s) X ${f(i.gx)} · Y ${f(i.gy)} · Z ${f(i.gz)}<br><b>${t("imu.accel")}</b> (g) X ${f(i.ax)} · Y ${f(i.ay)} · Z ${f(i.az)}<br>${t("imu.total")} ${g.toFixed(2)} g ${g > 0.85 && g < 1.15 ? t("imu.rest") : ""} · ${t("imu.max")} ${gyroMax.toFixed(0)}°/s`;
  // inclinação relativa à posição de repouso (a primeira leitura, ou a de quando tocou em Zerar)
  if (!tiltBase) tiltBase = { ax: i.ax, ay: i.ay, az: i.az };
  const ang = (a, b) => Math.atan2(a, b) * 57.3, wrap = (v) => ((v + 540) % 360) - 180;
  const roll = -wrap(ang(i.ax, i.ay) - ang(tiltBase.ax, tiltBase.ay)), pitch = wrap(ang(i.az, i.ay) - ang(tiltBase.az, tiltBase.ay));
  flight.roll += (roll - flight.roll) * 0.2; flight.pitch += (pitch - flight.pitch) * 0.2;
  drawPlane();
}
// avião: ele fica no centro e o mundo gira em volta, como no painel de um avião de verdade
const flight = { roll: 0, pitch: 0, t: 0 };
const CLOUDS = Array.from({ length: 9 }, (_, i) => ({ x: i * 170 - 680, y: -60 - (i * 47) % 130, s: 0.6 + (i % 3) * 0.3 }));
function drawPlane() {
  const cv = $("plane"), c = cv.getContext("2d"), w = cv.width, h = cv.height;
  flight.t += 2.2;
  c.save(); c.translate(w / 2, h / 2); c.rotate(-flight.roll / 57.3); c.translate(0, Math.max(-140, Math.min(140, flight.pitch * 3)));
  const sky = c.createLinearGradient(0, -420, 0, 0); sky.addColorStop(0, "#2a1670"); sky.addColorStop(1, "#8b6cff");
  c.fillStyle = sky; c.fillRect(-900, -900, 1800, 900);
  const ground = c.createLinearGradient(0, 0, 0, 420); ground.addColorStop(0, "#3b1d8a"); ground.addColorStop(1, "#120b33");
  c.fillStyle = ground; c.fillRect(-900, 0, 1800, 900);
  c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = 2; c.beginPath(); c.moveTo(-900, 0); c.lineTo(900, 0); c.stroke();
  c.fillStyle = "rgba(255,255,255,.75)";
  for (const k of CLOUDS) {
    const x = ((k.x + flight.t * k.s + 900) % 1800 + 1800) % 1800 - 900;
    for (const [ox, oy, r] of [[0, 0, 18], [20, 5, 14], [-20, 6, 13]]) { c.beginPath(); c.arc(x + ox * k.s, k.y + oy * k.s, r * k.s, 0, 7); c.fill(); }
  }
  c.strokeStyle = "rgba(255,255,255,.14)"; c.lineWidth = 2;
  for (let i = 1; i < 12; i++) { const x = ((i * 150 - flight.t * 2) % 1800 + 1800) % 1800 - 900; c.beginPath(); c.moveTo(x * 0.2, 8); c.lineTo(x * 1.4, 300); c.stroke(); }
  c.restore();
  // avião visto de trás
  c.save(); c.translate(w / 2, h / 2 + 10);
  c.fillStyle = "#fff"; c.strokeStyle = "#1b1240"; c.lineWidth = 3; c.lineJoin = "round";
  c.beginPath(); c.moveTo(-120, 12); c.lineTo(-20, -6); c.lineTo(20, -6); c.lineTo(120, 12); c.lineTo(120, 20); c.lineTo(20, 12); c.lineTo(-20, 12); c.lineTo(-120, 20); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#c026d3"; c.beginPath(); c.moveTo(-4, -8); c.lineTo(0, -46); c.lineTo(4, -8); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#fff"; c.beginPath(); c.moveTo(-42, -12); c.lineTo(42, -12); c.lineTo(42, -6); c.lineTo(-42, -6); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = "#7c5cff"; c.beginPath(); c.arc(0, 2, 20, 0, 7); c.fill(); c.stroke();
  c.fillStyle = "#fde047"; c.beginPath(); c.arc(0, 2, 8, 0, 7); c.fill();
  c.restore();
  c.fillStyle = "#fff"; c.font = "600 18px system-ui"; c.textAlign = "left";
  c.fillText(`${t("flight.bank")} ${Math.round(flight.roll)}°  ·  ${t("flight.pitch")} ${Math.round(flight.pitch)}°`, 14, h - 14);
}
let tiltBase = null;
$("btnTiltZero").onclick = () => { tiltBase = null; };
function drawTrgGraph() {
  const cv = $("trgGraph"), c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = CV.grid; c.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((k) => { c.beginPath(); c.moveTo(0, h * k); c.lineTo(w, h * k); c.stroke(); });
  const n = 240;
  for (const [key, col] of [["l2", CV.l], ["r2", CV.r]]) {
    c.strokeStyle = col; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath();
    trgHist.forEach((p, i) => { const x = w - (trgHist.length - 1 - i) * (w / n), y = h - 6 - p[key] * (h - 12); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  }
  c.font = "600 20px system-ui"; c.fillStyle = CV.l; c.fillText("L2", 10, 26); c.fillStyle = CV.r; c.fillText("R2", 46, 26);
}

// ================================================================ status (cartão do controle e números-resumo)
function batteryTxt(b) {
  if (!b) return "";
  if (b.error) return t("bat.error");
  return t("bat.level", { n: b.level }) + (b.charging ? " ⚡ " + t("bat.charging") : b.cable && b.level === 100 ? " · " + t("bat.full") : "");
}
const batteryShort = (b) => b.error ? t("bat.error") : b.level + "%" + (b.charging ? " ⚡ " + t("bat.charging") : b.cable && b.level === 100 ? " · " + t("bat.full") : "");
let lastMeta = "";
function renderStatus() {
  const on = src !== null;
  $("dot").className = "dot" + (src === "hid" ? " hid" : on ? " on" : "");
  if (!on) { $("devName").textContent = t("st.none"); $("devSub").textContent = t("st.noneSub"); }
  else if (src === "hid") {
    $("devName").textContent = modelName(model);
    $("devSub").textContent = [hidInfo?.color && t("color." + hidInfo.color), hidInfo?.board, hidInfo?.serial].filter(Boolean).join(" · ") || t("st.usb");
  } else {
    $("devName").textContent = unknownPad ? t("st.controller") : modelName(model);
    $("devSub").textContent = padId;
  }
  const pills = [];
  if (src === "hid") pills.push(`<span class="badge info">${t("pill.usb")}</span>`);
  if (src === "pad") pills.push(`<span class="badge">${t("pill.basic")}</span>`);
  if (src === "hid" && hidInfo?.clone) pills.push(`<span class="badge bad">${t("pill.clone")}</span>`);
  if (src === "hid" && isUnsaved()) pills.push(`<span class="badge warn">${t("pill.unsaved")}</span>`);
  const html = pills.join("");
  if (html !== lastMeta) { $("devMeta").innerHTML = html; lastMeta = html; }
  const b = S.battery;
  $("devBatt").classList.toggle("hidden", !b);
  if (b) { $("devBattBar").style.width = (b.error ? 0 : b.level) + "%"; $("devBattTxt").textContent = b.error ? t("bat.error") : b.level + "%" + (b.charging ? " ⚡" : ""); }
  $("btnUsbApp").classList.toggle("hidden", !HAS_HID || src === "hid");
  $("btnUsbApp").disabled = $("btnUsb").disabled = connecting;
  const un = src === "hid" && isUnsaved();
  $("unsavedTop").classList.toggle("hidden", !un || page === "calib");
  if (un && !$("unsavedTop").innerHTML) $("unsavedTop").innerHTML = `${t("top.unsaved")} <button class="b sm" data-act="calib">${t("top.unsavedBtn")}</button>`;
  notice();
}
function notice() {
  let h = "";
  if (!src) h = t("n.none");
  else if (src === "pad") {
    if (!padStandard) h = t("n.nonStd");
    else if (unknownPad) h = t("n.unknown");
    else if (model.key === "VR2L" || model.key === "VR2R") h = t("n.vr2");
    else if (HAS_HID && (page === "overview")) h = t("n.upgrade");
  }
  if ($("notice").innerHTML !== h) $("notice").innerHTML = h;
}
function kpi(id, v, sub, cls = "") {
  const el = $(id);
  el.className = "card kpi " + cls;
  el.querySelector(".kpi-v").textContent = v;
  el.querySelector(".kpi-s").textContent = sub;
}
function renderKpis() {
  const ok = ITEMS.filter((it) => it.st() === "ok").length, n = ITEMS.length || 1;
  const pct = Math.round(ok / n * 100);
  kpi("kHealth", pct + "%", t("k.healthS", { a: ok, b: ITEMS.length }), pct >= 90 ? "good" : pct >= 40 ? "warn" : "");
  const b = S.battery;
  kpi("kBat", b && !b.error ? b.level + "%" : "—", b ? batteryTxt(b) : t("k.batNone"), b && !b.error ? (b.level < 20 ? "bad" : "good") : "");
  for (const [id, k] of [["kL", "L"], ["kR", "R"]]) {
    const c = circularity(sectors[k]), d = drift[k];
    const cls = d !== null && d > 0.1 ? "bad" : c ? (c.err < 12 ? "good" : "warn") : "";
    kpi(id, d === null ? "—" : d.toFixed(3), d !== null && d > 0.1 ? t("k.drift") : c ? t("sm.err", { n: c.err.toFixed(1) }) : t("k.stickS"), cls);
  }
  kpi("kRate", rate ? rate + " Hz" : "—", src === "hid" ? t("k.rateUsb") : src ? t("k.ratePad") : "", rate >= 200 ? "good" : "");
}
function usbHint() {
  $("usbHint").textContent = HAS_HID ? t("hint.ok") : MOBILE ? t("hint.mobile") : t("hint.browser");
  $("btnUsb").disabled = !HAS_HID;
}

// ================================================================ última conexão, calibração não salva
const unsavedKey = () => hidInfo?.serial ? "unsaved." + hidInfo.serial : null;
const isUnsaved = () => { const k = unsavedKey(); return !!k && store.get(k) === "1"; };
function setUnsaved(v) { const k = unsavedKey(); if (k) store.set(k, v ? "1" : null); $("unsavedTop").innerHTML = ""; renderPage(); renderStatus(); }
function renderLast() {
  let info = null; try { info = JSON.parse(store.get("last") || "null"); } catch { /* ignora */ }
  if (!info) { $("gateLast").innerHTML = ""; return; }
  const m = MODELS[info.key];
  const bits = [info.color && t("color." + info.color), info.board, m ? modelName(m) : ""].filter(Boolean).join(" ");
  const warn = info.serial && store.get("unsaved." + info.serial) === "1";
  $("gateLast").innerHTML = `${t("last.t")} <b>${esc(bits)}</b>${info.serial ? ", " + esc(t("st.serial", { s: info.serial })) : ""}` + (warn ? `<div class="warnline">${t("last.unsaved")}</div>` : "");
}

// ================================================================ Bluetooth / Gamepad API (modo básico)
function readPad() {
  const list = (navigator.getGamepads && navigator.getGamepads()) || [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}
addEventListener("gamepadconnected", (e) => addLog(t("log.connected", { id: e.gamepad.id })));
addEventListener("gamepaddisconnected", () => addLog(t("log.disconnected")));
function pollPad() {
  const g = readPad();
  if (!g) { if (src === "pad") { src = null; padIndex = null; lastPad = null; clearLive(); renderStatus(); } return; }
  if (src !== "pad" || padIndex !== g.index) { addLog(t("log.reading", { id: g.id })); src = "pad"; padIndex = g.index; }
  padId = g.id; padStandard = g.mapping === "standard"; padButtons = g.buttons.length; padAxes = g.axes.length; lastPad = g;
  if (g.timestamp !== padStamp) { padStamp = g.timestamp; samples++; }
  const m = modelFromGamepadId(g.id);
  setModel(m || MODELS.DS5, !m);
  S.pressed.clear();
  g.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && GAMEPAD_ORDER[i]) S.pressed.add(GAMEPAD_ORDER[i]); });
  S.lx = g.axes[0] || 0; S.ly = g.axes[1] || 0; S.rx = g.axes[2] || 0; S.ry = g.axes[3] || 0;
  S.l2 = g.buttons[6] ? g.buttons[6].value : 0; S.r2 = g.buttons[7] ? g.buttons[7].value : 0;
  S.imu = null; S.touches = []; S.battery = null;
  if (screen === "gate" && !connecting) { toast(t("toast.padIn", { m: unknownPad ? t("st.controller") : modelName(model) }), "ok"); showApp(); }
}
function clearLive() { S.pressed.clear(); S.lx = S.ly = S.rx = S.ry = S.l2 = S.r2 = 0; S.imu = null; S.touches = []; S.battery = null; S.stopL2 = S.stopR2 = null; }

// ================================================================ USB (WebHID): modo completo
async function connectUsb() {
  if (!HAS_HID) { toast(t("hint.browser"), "bad"); return; }
  if (connecting || hid) return;
  let dev;
  try { dev = (await navigator.hid.requestDevice({ filters: HID_FILTERS }))[0]; } // sempre mostra a janela de escolha do navegador
  catch (e) { toast(t("err.chooser") + " " + e.message, "bad"); return; }
  if (!dev) return;
  await openDevice(dev);
}
async function openDevice(dev) {
  connecting = true; renderStatus();
  loading(true, rebooting ? "load.reboot" : "load.open", 0, dev.productName || "");
  try { if (dev.opened) { await dev.close(); await sleep(300); } await dev.open(); }
  catch { connecting = false; rebooting = false; loading(false); renderStatus(); toast(t("err.busy"), "bad", 7000); return; }
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
  setTimeout(() => { if (first && connecting) { connecting = false; rebooting = false; loading(false); renderStatus(); toast(t("err.noInput"), "bad"); dev.close().catch(() => {}); } }, 3000);
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
  // guarda o ajuste fino atual no histórico (para "Restaurar calibração")
  if (info && !info.clone && (p.key === "DS5" || p.key === "EDGE") && !isUnsaved()) {
    try { const d = await p.finetune(); if (d) hist.save(info.serial, d); } catch { /* opcional */ }
  }
  addLog("USB: " + modelName(p.model) + (info?.serial ? " · " + info.serial : ""));
  await sleep(450);
  connecting = false; rebooting = false; loading(false); showApp(); renderStatus(); renderPage();
  if (info?.nv === "pending_reboot") toast(t("toast.reboot"), "bad", 8000);
  else if (isUnsaved()) toast(t("toast.unsaved"), "", 7000);
  else toast(t("toast.usbIn", { m: modelName(p.model) }), "ok");
}
function onReport(e) {
  if (!hid) return;
  samples++;
  if (!rawFrozen) { prevRaw = lastRaw; lastRaw = new Uint8Array(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)); }
  let r; try { r = parseInput(hid.key, e.data); } catch { return; }
  S.lx = r.lx; S.ly = r.ly; S.rx = r.rx; S.ry = r.ry; S.l2 = r.l2; S.r2 = r.r2; S.pressed = r.pressed;
  S.imu = r.imu; S.touches = r.touches; S.battery = r.battery; S.stopL2 = r.stopL2 ?? null; S.stopR2 = r.stopR2 ?? null;
  for (const p of r.touches) { touchSeen.minX = Math.min(touchSeen.minX, p.x); touchSeen.maxX = Math.max(touchSeen.maxX, p.x); touchSeen.n++; }
  if (r.imu) gyroMax = Math.max(gyroMax, Math.abs(r.imu.gx), Math.abs(r.imu.gy), Math.abs(r.imu.gz));
}
function usbGone(msgKey = "toast.usbOut") {
  if (!hid) return;
  hid = null; hidInfo = null; lastRaw = prevRaw = null; tiltBase = null;
  if (src === "hid") { src = null; clearLive(); }
  if (busy) { busy = false; showMsg(t("dlg.lostT"), t("dlg.lostD"), "bad"); }
  if (msgKey) { addLog(t(msgKey)); toast(t(msgKey)); }
  stopMic();
  renderStatus(); renderPage();
  if (rebooting) { loading(true, "load.reboot", 0); setTimeout(() => { if (rebooting) { rebooting = false; loading(false); showGate(); toast(t("toast.rebootManual"), "", 7000); } }, 9000); }
  else if (msgKey && !readPad()) showGate();
}
if (HAS_HID) {
  navigator.hid.addEventListener("disconnect", (e) => { if (hid && e.device === hid.device) usbGone(); });
  navigator.hid.addEventListener("connect", (e) => { if (wantHid && !hid && !connecting && HID_FILTERS.some((f) => f.productId === e.device.productId)) setTimeout(() => openDevice(e.device), 800); });
}
$("btnUsb").onclick = connectUsb; $("btnUsbApp").onclick = connectUsb;

// ================================================================ vibração (ação rápida)
async function rumbleTest() {
  const msg = $("rumbleMsg");
  if (src === "hid") {
    if (!hid.hasHaptics) { msg.textContent = t("vib.none"); return false; }
    try { await hid.rumble(255, 255); await sleep(600); await hid.rumble(0, 0); msg.textContent = t("vib.sent"); return true; }
    catch (e) { msg.textContent = t("vib.fail") + " " + errMsg(e); return false; }
  }
  const g = readPad();
  if (!g) { msg.textContent = t("vib.noPad"); return false; }
  const act = g.vibrationActuator || (g.hapticActuators && g.hapticActuators[0]);
  if (!act) { msg.textContent = t("vib.noApi"); return false; }
  try {
    if (act.playEffect) await act.playEffect("dual-rumble", { duration: 600, strongMagnitude: 1, weakMagnitude: 1 });
    else if (act.pulse) await act.pulse(1, 600);
    msg.textContent = t("vib.sent"); return true;
  } catch (e) { msg.textContent = t("vib.fail") + " " + e.message; return false; }
}
$("btnRumble").onclick = rumbleTest;

// ================================================================ checklist (Diagnóstico)
const ST = (s) => t("vs." + s);
function stickSt(k) {
  const c = circularity(sectors[k]); if (!c) return sectors[k].some((m) => m > 0.15) ? "warn" : "idle";
  if (drift[k] !== null && drift[k] > 0.1) return "bad";
  return c.err < 12 ? "ok" : "warn";
}
const trigItem = (n) => ({ id: n, t: () => t("v.trigger", { n: n.toUpperCase() }), d: () => t("v.max", { n: Math.round(maxTrig[n] * 100) }), st: () => maxTrig[n] > 0.95 ? "ok" : maxTrig[n] > 0 ? "warn" : "idle" });
const manualItem = (id, tk, dk) => ({ id, t: () => t(tk), d: () => t(dk), st: () => manual[id] || "idle", manual: true });
const isDs5 = () => model && (model.key === "DS5" || model.key === "EDGE");
const isVr2 = () => model && (model.key === "VR2L" || model.key === "VR2R");
function reqButtons() { const k = model?.key || "DS5"; return buttonsOf(k).filter((n) => src === "hid" || !["touchpad", "mute"].includes(n)); }
function items() {
  const k = model?.key || "DS5", usb = src === "hid", vr2 = isVr2();
  const req = reqButtons();
  const list = [manualItem("usb", "v.usb", "v.usbD")];
  list.push({
    id: "btn", t: () => t("v.buttons"),
    d: () => { const f = req.filter((n) => !tested.has(n)); return f.length ? t("v.btnMissing", { a: req.length - f.length, b: req.length, list: f.map(L).join(", ") }) : t("v.btnAll") + (usb ? "" : " " + t("v.btnBrowser")); },
    st: () => req.every((n) => tested.has(n)) ? "ok" : req.some((n) => tested.has(n)) ? "warn" : "idle",
  });
  if (vr2) list.push({ id: "L", t: () => t("v.stick"), d: () => stickRead("L"), st: () => stickSt("L") });
  else list.push({ id: "L", t: () => t("v.stickL"), d: () => stickRead("L"), st: () => stickSt("L") }, { id: "R", t: () => t("v.stickR"), d: () => stickRead("R"), st: () => stickSt("R") });
  if (k !== "VR2R") list.push(trigItem("l2"));
  if (k !== "VR2L") list.push(trigItem("r2"));
  if (usb && !vr2) {
    list.push({ id: "touch", t: () => t("v.touch"), d: () => touchSeen.n ? t("v.touchD", { n: Math.round((touchSeen.maxX - touchSeen.minX) / TOUCH_W * 100) }) : t("v.touchHint"),
      st: () => touchSeen.n === 0 ? "idle" : (touchSeen.maxX - touchSeen.minX) / TOUCH_W > 0.7 ? "ok" : "warn" });
    list.push({ id: "gyro", t: () => t("v.gyro"), d: () => gyroMax ? t("v.gyroD", { n: gyroMax.toFixed(0) }) : t("v.gyroHint"), st: () => gyroMax > 150 ? "ok" : gyroMax > 20 ? "warn" : "idle" });
  }
  if (!vr2) list.push(manualItem("vib", "v.vib", usb ? "v.vibUsb" : "v.vibD"));
  if (usb && !vr2) list.push(manualItem("light", "v.light", "v.lightD"));
  if (usb && isDs5()) list.push(manualItem("adaptive", "v.adaptive", "v.adaptiveD"), manualItem("spk", "v.spk", "v.spkD"), manualItem("mic", "v.mic", "v.micD"));
  return list;
}
let ITEMS = [], rows = [], prevSt = [];
function buildVal() {
  const sig = (model?.key || "-") + src + getLang();
  if (sig === valSig) return;
  valSig = sig; ITEMS = items(); prevSt = [];
  $("valList").innerHTML = `<h2>${t("val.list")}</h2>`;
  rows = ITEMS.map((it) => {
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<div><div class="t">${esc(it.t())}</div><div class="d"></div>${it.manual ? `<div class="acts"><button class="b sm" data-v="ok">${t("v.pass")}</button><button class="b sm neon" data-v="fail">${t("v.fail")}</button></div>` : ""}</div><span class="badge"></span>`;
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
    const b = rows[i].querySelector(".badge");
    if (prevSt[i] !== s) {
      b.textContent = ST(s); b.className = "badge " + (s === "idle" ? "" : s === "fail" ? "bad" : s);
      if (prevSt[i] !== undefined && s === "ok") pop(b);
      prevSt[i] = s;
    }
  });
  countTo($("sumOk"), ok); $("sumAll").textContent = ITEMS.length;
  setRing($("vring"), ITEMS.length ? ok / ITEMS.length : 0);
  $("nbDiag").textContent = `${ok}/${ITEMS.length}`;
}
function resetTests() {
  tested.clear(); sectors.L.fill(0); sectors.R.fill(0); maxTrig.l2 = maxTrig.r2 = 0; drift.L = drift.R = null;
  stickDone.L = stickDone.R = false; for (const k of Object.keys(manual)) delete manual[k];
  touchSeen.minX = Infinity; touchSeen.maxX = -Infinity; touchSeen.n = 0; gyroMax = 0; dust.length = 0;
  log = []; $("log").textContent = ""; svgCache.clear(); renderVal();
}
$("btnReset").onclick = resetTests;

// ================================================================ janelas
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
// espera um clique num dos ids; se a janela fechar, devolve "close"
function waitAny(ids) {
  return new Promise((res) => {
    const onClose = () => res("close");
    dlg.addEventListener("close", onClose, { once: true });
    for (const id of ids) { const el = $(id); if (el) el.onclick = () => { dlg.removeEventListener("close", onClose); res(id); }; }
  });
}
const nextBtn = (id, key) => `<button class="b arrow" id="${id}"><span>${t(key)}</span><span class="ar">${icon("arrow")}</span></button>`;
const stepsBar = (n, cur) => `<div class="steps">${Array.from({ length: n }, (_, i) => `<i class="${i < cur ? "done" : i === cur ? "on" : ""}"></i>`).join("")}</div>`;
function failMsg(e) {
  busy = false;
  showMsg(t("dlg.failT"), esc(errMsg(e)) + "<br><br>" + t("dlg.failD"), "bad");
  addLog("✖ " + errMsg(e));
}

// ================================================================ calibração
function calibBlock() {
  if (!hidInfo) return t("cb.noInfo");
  if (hidInfo.clone) return t("cb.clone");
  if (hidInfo.oldFw) return t("cb.oldFw");
  if (hidInfo.nv === "pending_reboot") return t("cb.reboot");
  return "";
}
async function centerWizard(quick) {
  if (!hid || busy || calibBlock()) return;
  const one = hid.model.sticks === 1, os = t(one ? "c.one" : "c.both");
  const intro = `<p>${t(quick ? "c.introQuick" : "c.intro4", { s: os })}</p>`;
  if (!await confirmDlg(t(quick ? "c.titleQuick" : "c.title4"), intro + `<div class="alert warn">${t("c.dontClose")}</div>`, t("c.start"))) return;
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
        showDlg(`<h3>${t("c.step", { n: i + 1 })}</h3>${stepsBar(4, i)}<div class="arrowbig" aria-hidden="true">${corners[i][0]}</div><p>${t(one ? "c.pushOne" : "c.pushBoth", { c: t(corners[i][1]) })}</p><div class="acts">${nextBtn("cNext", "c.next")}</div>`);
        $("cNext").focus();
        busy = true;
        await waitAny(["cNext"]);
        $("cNext").disabled = true; $("cNext").innerHTML = `<span class="spin"></span>${t("c.reading")}`;
        await sleep(150);
        await dev.centerSample();
      }
      await sleep(200);
      await dev.centerEnd();
    }
    busy = false;
    addLog(t("log.center")); setUnsaved(true);
    showMsg(t("c.doneT"), t("c.doneD"));
  } catch (e) { failMsg(e); }
}

async function rangeWizard(expert) {
  if (!hid || busy || calibBlock()) return;
  const one = hid.model.sticks === 1;
  const intro = `<p>${t(expert ? "r.introExpert" : "r.intro", { s: t(one ? "c.one" : "c.both") })}</p><div class="alert warn">${t("r.warn")}</div>`;
  if (!await confirmDlg(t(expert ? "r.titleExpert" : "r.title"), intro, t("c.start"))) return;
  busy = true;
  const dev = hid, N = 48, need = 4;
  const fill = { L: new Array(N).fill(0), R: new Array(N).fill(0) }, cyc = { L: 0, R: 0 };
  showDlg(`<h3>${t("r.spin")}</h3><p class="sub">${t("r.keep")}</p>
    <div class="dlgsticks"><canvas id="rL" width="300" height="300"></canvas>${one ? "" : '<canvas id="rR" width="300" height="300"></canvas>'}</div>
    ${expert ? "" : '<div class="prog"><i id="rp"></i></div><div class="sub" id="rt">0%</div>'}
    <div class="acts"><button class="b go" id="rDone" ${expert ? "" : "disabled"}>${t("r.done")}</button></div>`);
  let running = true, secs = expert ? 0 : 15, pct = 0;
  try { await sleep(500); await dev.rangeBegin(); } catch (e) { running = false; failMsg(e); return; }
  const tick = setInterval(() => { secs--; refreshBtn(); }, 1000);
  function refreshBtn() {
    const b = $("rDone"); if (!b || expert) return;
    const ok = secs <= 0 || pct >= 100;
    b.disabled = !ok; b.textContent = ok ? t("r.done") : `${t("r.done")} (${secs})`;
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
    const cl = $("rL"); if (cl) drawStick(cl, S.lx, S.ly, fill.L, "circ");
    const cr = $("rR"); if (cr) drawStick(cr, S.rx, S.ry, fill.R, "circ");
    refreshBtn();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  await waitAny(["rDone"]);
  running = false; clearInterval(tick);
  $("rDone").disabled = true; $("rDone").innerHTML = `<span class="spin"></span>${t("r.saving")}`;
  try {
    await dev.rangeEnd();
    busy = false;
    addLog(t("log.range")); setUnsaved(true);
    showMsg(t("r.doneT"), t("r.doneD"));
  } catch (e) { failMsg(e); }
}

// ---- ajuste fino (DualSense e Edge): mexe nos números do centro de cada analógico
async function fineTune() {
  if (!hid || busy || calibBlock() || !(hid.key === "DS5" || hid.key === "EDGE")) return;
  const dev = hid;
  let orig;
  try { orig = await dev.finetune(); } catch (e) { failMsg(e); return; }
  if (!orig) { failMsg({ key: "err.finetune" }); return; }
  const cur = orig.slice(); let step = 5, changed = false;
  const center = [["LX", 8], ["LY", 9], ["RX", 10], ["RY", 11]];
  const nudgeRow = ([n, i]) => `<div><div class="sub">${n}</div><div class="nudge"><button class="b sm" data-i="${i}" data-d="-1" aria-label="${n} −">−</button><output id="fv${i}">${cur[i]}</output><button class="b sm" data-i="${i}" data-d="1" aria-label="${n} +">+</button></div></div>`;
  showDlg(`<h3>${t("fine.title")}</h3><p class="sub">${t("fine.help")}</p>
    <div class="dlgsticks"><canvas id="fL" width="300" height="300"></canvas><canvas id="fR" width="300" height="300"></canvas></div>
    <div class="fine">${center.map(nudgeRow).join("")}</div>
    <div class="row"><div class="t">${t("fine.step")}</div><span class="seg" id="fStep"><span class="segpill"></span>${[1, 5, 20, 100].map((s) => `<button data-s="${s}" class="${s === 5 ? "on" : ""}">${s}</button>`).join("")}</span></div>
    <details><summary>${t("fine.adv")}</summary><div class="fine" style="margin-top:8px">${FINE_NAMES.map((n, i) => `<label class="sub">${n}<input type="number" min="0" max="${dev.fineMax}" id="fa${i}" value="${cur[i]}"></label>`).join("")}</div>
      <div class="acts"><button class="b sm" id="fApply">${t("fine.apply")}</button></div></details>
    <div class="acts"><button class="b go" id="fDone">${t("fine.done")}</button><button class="b neon" id="fUndo">${t("fine.undo")}</button></div>`);
  requestAnimationFrame(() => moveSeg($("fStep")));
  busy = true;
  let writing = false, pending = false;
  async function push() {
    if (writing) { pending = true; return; }
    writing = true;
    try { await dev.writeFinetune(cur); changed = true; } catch (e) { toast(t("err.cmd") + " " + errMsg(e), "bad"); }
    writing = false;
    if (pending) { pending = false; push(); }
  }
  const sync = () => { for (const [, i] of center) { const o = $("fv" + i); if (o) o.textContent = cur[i]; } FINE_NAMES.forEach((_, i) => { const a = $("fa" + i); if (a) a.value = cur[i]; }); };
  $("dlgBody").onclick = (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) { const i = +b.dataset.i; cur[i] = Math.max(0, Math.min(dev.fineMax, cur[i] + step * +b.dataset.d)); sync(); push(); return; }
    const s = e.target.closest("#fStep button[data-s]");
    if (s) { step = +s.dataset.s; $("fStep").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === s)); moveSeg($("fStep")); }
  };
  $("fApply").onclick = () => { FINE_NAMES.forEach((_, i) => { cur[i] = Math.max(0, Math.min(dev.fineMax, Math.round(+$("fa" + i).value || 0))); }); sync(); push(); };
  let live = true;
  (function frame() { if (!live || hid !== dev) return; const a = $("fL"), b = $("fR"); if (a) drawStick(a, S.lx, S.ly, null, "zoom"); if (b) drawStick(b, S.rx, S.ry, null, "zoom"); requestAnimationFrame(frame); })();
  const r = await waitAny(["fDone", "fUndo"]);
  live = false; $("dlgBody").onclick = null;
  if (r === "fUndo" || r === "close") {
    try { await dev.writeFinetune(orig); } catch { /* o controle saiu */ }
    busy = false; closeDlg(); toast(t("fine.reverted"));
    return;
  }
  busy = false; closeDlg();
  if (changed) { setUnsaved(true); addLog(t("log.fine")); toast(t("fine.saved"), "ok"); }
}

async function restoreFrom(id) {
  if (!hid || busy || !hidInfo?.serial) return;
  const e = hist.get(hidInfo.serial, id); if (!e) return;
  if (!await confirmDlg(t("hist.confirmT"), `<p>${t("hist.confirmD", { d: new Date(e.ts).toLocaleString(getLang()) })}</p>`, t("hist.restore"), "go")) return;
  try { await hid.writeFinetune(e.data); setUnsaved(true); addLog(t("log.restored")); closeDlg(); toast(t("hist.done"), "ok"); }
  catch (err) { failMsg(err); }
}
function renderHistory() {
  const list = hidInfo?.serial ? hist.list(hidInfo.serial) : [];
  $("histList").innerHTML = list.length ? list.map((e, i) => `<div class="row"><div><div class="t">${esc(new Date(e.ts).toLocaleString(getLang()))}${i === 0 ? ` <span class="badge info">${t("hist.latest")}</span>` : ""}</div><div class="d mono">LX ${e.data[8]} · LY ${e.data[9]} · RX ${e.data[10]} · RY ${e.data[11]}</div></div><button class="b sm" data-restore="${e.id}">${t("hist.restore")}</button></div>`).join("")
    : `<p class="sub">${t("hist.empty")}</p>`;
}
$("histList").addEventListener("click", (e) => { const b = e.target.closest("[data-restore]"); if (b) restoreFrom(b.dataset.restore); });

async function saveCalib() {
  if (!hid || busy) return;
  const edge = hid.isEdge;
  if (!await confirmDlg(t("s.title"), `<p>${t("s.intro")}</p>${edge ? `<div class="alert warn">${t("s.edge")}</div>` : ""}`, t("s.btn"), "go")) return;
  busy = true;
  const dev = hid;
  showDlg(`<h3>${t("s.running")}</h3><p class="sub">${t("s.noCable")}</p><div class="prog"><i id="sp"></i></div>`);
  try {
    await dev.save((v) => { const el = $("sp"); if (el) el.style.width = v + "%"; });
    busy = false;
    if (hidInfo) hidInfo.nv = await dev.nvStatus();
    if (hidInfo?.serial && (dev.key === "DS5" || dev.key === "EDGE")) { try { const d = await dev.finetune(); if (d) hist.save(hidInfo.serial, d); } catch { /* opcional */ } }
    setUnsaved(false);
    addLog(t("log.saved"));
    showMsg(t("s.doneT"), t("s.doneD") + (edge ? " " + t("s.doneEdge") : ""));
  } catch (e) { failMsg(e); }
}
async function rebootCtrl() {
  if (!hid || busy) return;
  if (!await confirmDlg(t("u.title"), `<p>${t("u.d")}</p>`, t("u.btn"), "neon")) return;
  closeDlg(); setUnsaved(false); addLog(t("log.reboot"));
  rebooting = true;
  await hid.reboot();
}
$("btnCenterQuick").onclick = () => centerWizard(true); $("btnCenter4").onclick = () => centerWizard(false);
$("btnRange").onclick = () => rangeWizard(false); $("btnRangeExpert").onclick = () => rangeWizard(true);
$("btnFine").onclick = fineTune; $("btnSave").onclick = saveCalib; $("btnReboot").onclick = rebootCtrl;

// ================================================================ saídas: luzes, motores, gatilhos, som, microfone
async function act(fn) {
  if (!hid || busy) return false;
  try { await fn(); return true; } catch (e) { toast(t("err.cmd") + " " + errMsg(e), "bad"); return false; }
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

// microfone: procura a entrada de áudio do controle e mostra o volume ao vivo
let mic = null;
function stopMic() {
  if (!mic) return;
  mic.stream.getTracks().forEach((tr) => tr.stop()); mic.ctx.close().catch(() => {}); clearTimeout(mic.timer);
  mic = null; $("micBar").style.width = "0"; $("btnMic").querySelector("span").textContent = t("mic.btn");
}
async function micTest() {
  if (mic) { stopMic(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { $("micTxt").textContent = t("mic.none"); return; }
  try {
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devs = await navigator.mediaDevices.enumerateDevices();
    const d = devs.find((x) => x.kind === "audioinput" && /dualsense|wireless controller|sony|ps5|ps4/i.test(x.label));
    if (d && stream.getAudioTracks()[0]?.getSettings().deviceId !== d.deviceId) {
      stream.getTracks().forEach((tr) => tr.stop());
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId } } });
    }
    $("micTxt").textContent = d ? t("mic.using", { n: d.label }) : t("mic.default");
    const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    mic = { stream, ctx: ac, peak: 0, timer: setTimeout(stopMic, 12000) };
    $("btnMic").querySelector("span").textContent = t("mic.stop");
    (function meter() {
      if (!mic) return;
      an.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length), lvl = Math.min(1, rms * 6);
      mic.peak = Math.max(mic.peak, lvl);
      $("micBar").style.width = Math.round(lvl * 100) + "%";
      requestAnimationFrame(meter);
    })();
  } catch { $("micTxt").textContent = t("mic.denied"); }
}
$("btnMic").onclick = micTest;

// ================================================================ teste rápido guiado
function quickSteps() {
  const usb = src === "hid", vr2 = isVr2(), steps = [];
  steps.push({ id: "btn", auto: () => reqButtons().every((n) => tested.has(n)), prog: () => `${reqButtons().filter((n) => tested.has(n)).length} / ${reqButtons().length}` });
  steps.push({ id: "sticks", auto: () => stickSt("L") === "ok" && (vr2 || stickSt("R") === "ok"), prog: () => stickRead("L") + (vr2 ? "" : "  |  " + stickRead("R")) });
  steps.push({ id: "trig", auto: () => (model.key === "VR2R" || maxTrig.l2 > 0.95) && (model.key === "VR2L" || maxTrig.r2 > 0.95), prog: () => `L2 ${Math.round(maxTrig.l2 * 100)}% · R2 ${Math.round(maxTrig.r2 * 100)}%` });
  if (usb && !vr2) {
    steps.push({ id: "touch", auto: () => (touchSeen.maxX - touchSeen.minX) / TOUCH_W > 0.7, prog: () => touchSeen.n ? Math.round((touchSeen.maxX - touchSeen.minX) / TOUCH_W * 100) + "%" : "0%" });
    steps.push({ id: "gyro", auto: () => gyroMax > 150, prog: () => gyroMax.toFixed(0) + "°/s" });
  }
  if (!vr2) steps.push({ id: "vib", manual: "vib", run: rumbleTest });
  if (usb && !vr2) steps.push({ id: "light", manual: "light", run: async () => { for (const c of ["#ff2030", "#20ff70", "#2f6bff", "#7c5cff"]) { await act(() => hid.light(...rgb(c))); await sleep(350); } } });
  if (usb && isDs5()) {
    steps.push({ id: "adaptive", manual: "adaptive", run: () => act(() => hid.triggers("heavy", "heavy")), after: () => act(() => hid.triggers("off", "off")) });
    steps.push({ id: "spk", manual: "spk", run: () => beep("speaker") });
  }
  steps.push({ id: "usb", manual: "usb" });
  return steps;
}
async function quickTest() {
  if (busy) return;
  if (!src) { toast(t("vib.noPad"), "bad"); return; }
  const steps = quickSteps();
  const res = {};
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const head = `<h3>${t("qt.step", { a: i + 1, b: steps.length })} · ${t("qt." + s.id + ".t")}</h3>${stepsBar(steps.length, i)}<p>${t("qt." + s.id + ".d")}</p>`;
    let r;
    if (s.auto) {
      showDlg(head + `<div class="alert" id="qtProg"></div><div class="acts">${nextBtn("qtNext", "qt.next")}<button class="b ghost sm" id="qtSkip">${t("qt.skip")}</button></div>`);
      const okNow = () => s.auto();
      let done = false;
      const iv = setInterval(() => {
        const p = $("qtProg"); if (!p) return;
        p.textContent = s.prog();
        const ok = okNow();
        p.className = "alert" + (ok ? "" : "");
        $("qtNext").disabled = !ok;
        if (ok && !done) { done = true; p.innerHTML = "✓ " + esc(s.prog()); setTimeout(() => $("qtNext")?.click(), 700); }
      }, 120);
      $("qtNext").disabled = true;
      r = await waitAny(["qtNext", "qtSkip"]);
      clearInterval(iv);
      res[s.id] = r === "qtNext" ? "ok" : r === "qtSkip" ? "skip" : null;
    } else {
      showDlg(head + `<div class="acts">${s.run ? `<button class="b sm" id="qtRun">${icon("play")}<span>${t("qt.again")}</span></button>` : ""}</div>
        <div class="acts"><button class="b go" id="qtYes">${t("qt.yes")}</button><button class="b neon" id="qtNo">${t("qt.no")}</button><button class="b ghost sm" id="qtSkip">${t("qt.skip")}</button></div>`);
      if (s.run) { $("qtRun").onclick = () => s.run(); s.run(); }
      r = await waitAny(["qtYes", "qtNo", "qtSkip"]);
      if (s.after) await s.after();
      res[s.id] = r === "qtYes" ? "ok" : r === "qtNo" ? "fail" : r === "qtSkip" ? "skip" : null;
      if (s.manual && (r === "qtYes" || r === "qtNo")) manual[s.manual] = r === "qtYes" ? "ok" : "fail";
    }
    if (r === "close") { renderVal(); return; }
  }
  renderVal();
  const okN = Object.values(res).filter((v) => v === "ok").length;
  showDlg(`<h3>${t("qt.endT")}</h3><p class="summary grad">${okN} / ${steps.length}</p>
    <div class="qt-list">${steps.map((s) => `<div><span>${t("qt." + s.id + ".t")}</span><span class="badge ${res[s.id] === "ok" ? "ok" : res[s.id] === "fail" ? "bad" : ""}">${t("qr." + (res[s.id] || "skip"))}</span></div>`).join("")}</div>
    <div class="acts"><button class="b shine" id="qtReport">${icon("doc")}<span>${t("qa.make")}</span></button><button class="b" id="qtClose">${t("dlg.ok")}</button></div>`);
  const r = await waitAny(["qtReport", "qtClose"]);
  closeDlg();
  if (r === "qtReport") makeReport();
  addLog(t("log.quick", { a: okN, b: steps.length }));
}
$("btnQuick").onclick = quickTest;

// ================================================================ extra: apoio por PIX
$("pixKey").textContent = PIX_KEY;
$("btnPixKey").onclick = () => copyText(PIX_KEY);
$("btnPixCode").onclick = () => copyText(pixPayload());
const waLink = () => { $("lnkWa").href = "https://wa.me/5521966547296?text=" + encodeURIComponent(t("ex.waMsg")); };

// ================================================================ laudo (imprimir / salvar em PDF)
function stickImage(k) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 300;
  const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, 300, 300);
  const keep = CV; CV = { ...CV, grid: "rgba(0,0,0,.18)", fill: "rgba(91,63,212,.15)", trail: "#5b3fd4", dot: "#5b3fd4" };
  drawStick(cv, 0, 0, sectors[k], "circ"); CV = keep;
  return cv.toDataURL("image/png");
}
function makeReport() {
  renderVal();
  const ok = ITEMS.filter((it) => it.st() === "ok").length;
  const cls = (s) => s === "ok" ? "ok" : s === "bad" || s === "fail" ? "bad" : s === "warn" ? "warn" : "";
  const info = [["info.model", model ? modelName(model) : "—"], ["rep.mode", src === "hid" ? t("pill.usb") : src ? t("pill.basic") : "—"], ...(hidInfo?.items || []), ...(S.battery ? [["info.battery", batteryShort(S.battery)]] : [])];
  if (src === "pad") info.push(["rep.padId", padId]);
  $("report").innerHTML = `
    <div class="rh"><img src="logo.png" alt=""><div><h1>${t("rep.title")}</h1><div>PS-5 Controle Test · MeoWDeV MOD · ${esc(new Date().toLocaleString(getLang()))}</div></div><div style="margin-left:auto;text-align:right"><div class="score">${ok} / ${ITEMS.length}</div><div>${t("rep.score")}</div></div></div>
    <h2>${t("info.title")}</h2><table>${info.map(([k, v, c]) => `<tr><th>${esc(t(k))}</th><td class="${c || ""}">${esc(val(v))}</td></tr>`).join("")}</table>
    <h2>${t("val.list")}</h2><table><tr><th>${t("rep.item")}</th><th>${t("rep.status")}</th><th>${t("rep.detail")}</th></tr>
      ${ITEMS.map((it) => { const s = it.st(); return `<tr><td>${esc(it.t())}</td><td class="${cls(s)}">${esc(ST(s))}</td><td>${esc(it.d())}</td></tr>`; }).join("")}</table>
    <h2>${t("sticks")}</h2><div class="rs"><div><img src="${stickImage("L")}" alt=""><div>${t("v.stickL")}: ${esc(stickRead("L"))}</div></div>${model?.sticks === 2 ? `<div><img src="${stickImage("R")}" alt=""><div>${t("v.stickR")}: ${esc(stickRead("R"))}</div></div>` : ""}</div>
    <p style="margin-top:14px;color:#555">${t("rep.foot")}</p>`;
  setTimeout(() => window.print(), 80);
}
$("btnReport").onclick = makeReport;

// ================================================================ informações
let infoAll = false;
function infoRows() {
  if (src === "hid") return [["info.model", modelName(hid.model)], ...(hidInfo ? hidInfo.items : [["info.title", { t: "info.fail" }, "bad"]]), ...(S.battery ? [["info.battery", batteryShort(S.battery)]] : []), ...(infoAll && hidInfo ? [["sep"], ...hidInfo.extra] : [])];
  if (src === "pad") return [["info.model", unknownPad ? t("st.controller") : modelName(model)], ["rep.mode", t("pill.basic")], ["rep.padId", padId], ["info.mapping", padStandard ? t("info.std") : t("st.nonStd")], ["info.counts", t("info.countsV", { b: padButtons, a: padAxes })]];
  return [];
}
function renderInfo() {
  const rowsI = infoRows();
  $("infoList").innerHTML = rowsI.length ? rowsI.map(([k, v, c]) => k === "sep" ? `<div class="sep"></div>` : `<dt>${esc(t(k))}</dt><dd class="${c || ""}">${esc(val(v))}</dd><button class="cp" data-copy="${esc(val(v))}" aria-label="${t("copy")} ${esc(t(k))}">${icon("copy")}</button>`).join("")
    : `<p class="sub" style="grid-column:1/-1">${t("info.noneYet")}</p>`;
  $("btnInfoAll").classList.toggle("hidden", !(src === "hid" && hidInfo?.extra?.length));
  $("btnInfoAll").textContent = t(infoAll ? "info.showLess" : "info.showAll");
}
$("infoList").addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (b) copyText(b.dataset.copy); });
$("btnInfoAll").onclick = () => { infoAll = !infoAll; renderInfo(); };
$("btnCopyInfo").onclick = () => copyText(infoRows().filter(([k]) => k !== "sep").map(([k, v]) => `${t(k)}: ${val(v)}`).join("\n"));

// ================================================================ depuração
function renderRaw() {
  if (rawFrozen) return;
  if (src === "hid" && lastRaw) {
    let out = "";
    for (let r = 0; r < lastRaw.length; r += 16) {
      out += r.toString(16).padStart(2, "0") + "  ";
      for (let i = r; i < Math.min(r + 16, lastRaw.length); i++) {
        const h = lastRaw[i].toString(16).padStart(2, "0");
        out += (prevRaw && prevRaw[i] !== lastRaw[i]) ? `<b>${h}</b> ` : lastRaw[i] ? `<em>${h}</em> ` : h + " ";
      }
      out += "\n";
    }
    $("rawHex").innerHTML = out;
  } else if (src === "pad" && lastPad) {
    $("rawHex").textContent = "axes  " + lastPad.axes.map((a) => a.toFixed(3)).join("  ") + "\n" +
      lastPad.buttons.map((b, i) => `b${String(i).padStart(2, "0")} ${b.value.toFixed(2)}${b.pressed ? " ●" : ""}`).join("\n");
  } else $("rawHex").textContent = t("dbg.none");
  $("dbgRate").textContent = (rate || "—") + " Hz";
}
$("btnFreeze").onclick = () => { rawFrozen = !rawFrozen; $("btnFreeze").textContent = t(rawFrozen ? "dbg.resume" : "dbg.freeze"); };
$("btnCopyRaw").onclick = () => copyText($("rawHex").textContent);
$("btnFr").onclick = async () => {
  if (!hid) { $("frOut").textContent = t("lock.debug"); return; }
  const s = $("frId").value.trim(), id = s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
  if (!(id >= 0 && id <= 255)) { $("frOut").textContent = t("dbg.badId"); return; }
  try {
    const bytes = await hid.readFeature(id);
    let out = "";
    for (let r = 0; r < bytes.length; r += 16) out += r.toString(16).padStart(2, "0") + "  " + bytes.slice(r, r + 16).map((b) => b.toString(16).padStart(2, "0")).join(" ") + "\n";
    $("frOut").textContent = out || "—";
    addLog(t("log.feature", { id: "0x" + id.toString(16) }));
  } catch (e) { $("frOut").textContent = t("dbg.fail") + " " + errMsg(e); }
};

// ================================================================ cada seção
function renderPage() {
  if (screen !== "app") return;
  const usb = !!hid, ds5 = usb && (hid.key === "DS5" || hid.key === "EDGE");
  if (page === "calib") {
    const lk = document.querySelector('[data-locked="calib"]');
    lk.classList.toggle("hidden", usb); if (!usb) lk.innerHTML = lockedCard("calib");
    $("calibOn").classList.toggle("hidden", !usb);
    if (usb) {
      const block = calibBlock();
      ["btnCenterQuick", "btnCenter4", "btnRange", "btnRangeExpert", "btnFine"].forEach((id) => { $(id).disabled = !!block; });
      if (block) { $("calibBlock").textContent = block; $("calibBlock").className = "alert bad"; }
      else if (hid.isVr2) { $("calibBlock").textContent = t("cb.vr2"); $("calibBlock").className = "alert warn"; }
      else $("calibBlock").className = "alert bad hidden";
      $("cardFine").classList.toggle("hidden", !ds5); $("cardHist").classList.toggle("hidden", !ds5);
      $("unsaved").classList.toggle("hidden", !isUnsaved());
      const nv = hidInfo?.nv, NV = { locked: "ok", unlocked: "warn", pending_reboot: "bad", unknown: "", error: "bad" };
      $("nvBadge").textContent = nv in NV ? t("nv." + nv) : "—"; $("nvBadge").className = "badge " + (NV[nv] || "");
      $("nvDesc").textContent = nv in NV ? t("nv." + nv + "D") : t("nv.none");
      if (ds5) renderHistory();
    }
  } else if (page === "out") {
    const lk = document.querySelector('[data-locked="out"]');
    lk.classList.toggle("hidden", usb); if (!usb) lk.innerHTML = lockedCard("out");
    $("outOn").classList.toggle("hidden", !usb);
    if (usb) {
      $("cardMotors").classList.toggle("hidden", !hid.hasHaptics);
      $("cardLight").classList.toggle("hidden", hid.isVr2);
      $("ledsRow").classList.toggle("hidden", !ds5); $("muteRow").classList.toggle("hidden", !ds5);
      $("cardTrig").classList.toggle("hidden", !ds5); $("cardAudio").classList.toggle("hidden", !ds5);
    }
  } else if (page === "info") renderInfo();
  else if (page === "sticks") $("smHelp").textContent = t("smh." + stickMode);
  document.querySelectorAll('#snav button[data-usb]').forEach((b) => {
    let l = b.querySelector(".lock");
    if (!usb && !l) { b.insertAdjacentHTML("beforeend", `<svg class="i lock"><use href="#i-lock"/></svg>`); }
    if (usb && l) l.remove();
  });
  notice();
}

// ================================================================ textos (troca de idioma)
function refreshTexts() {
  applyI18n();
  waLink();
  for (const [b, name] of swatchEls) { const s = t("light." + name); b.title = s; b.setAttribute("aria-label", s); }
  pick.setAttribute("aria-label", t("light.pick"));
  ledEls.forEach((b, i) => b.setAttribute("aria-label", t("light.led", { n: i + 1 })));
  for (const [n, el] of chipEls) el.textContent = L(n);
  document.querySelectorAll("#snav button[data-page]").forEach((b) => b.setAttribute("aria-label", t("pg." + b.dataset.page)));
  valSig = ""; lastMeta = ""; $("unsavedTop").innerHTML = "";
  usbHint(); renderStatus(); renderLast(); renderVal();
  if (screen === "app") { $("pageTitle").textContent = t("pg." + page); $("crumb").textContent = t("pgd." + page); renderPage(); }
  if (!mic) $("btnMic").querySelector("span").textContent = t("mic.btn");
  $("btnFreeze").textContent = t(rawFrozen ? "dbg.resume" : "dbg.freeze");
  requestAnimationFrame(() => moveSeg($("stickMode")));
}

// ================================================================ laço principal
let lastSlow = 0, lastRate = 0;
function loop(now) {
  if (src !== "hid" && !connecting && !rebooting) pollPad();
  if (src) {
    for (const n of S.pressed) if (!tested.has(n)) { tested.add(n); addLog(t("log.tested", { b: L(n) })); }
    if (S.l2 > 0.02) tested.add("l2"); if (S.r2 > 0.02) tested.add("r2");
    maxTrig.l2 = Math.max(maxTrig.l2, S.l2); maxTrig.r2 = Math.max(maxTrig.r2, S.r2);
    stickTrack("L", S.lx, S.ly); if (model.sticks === 2) stickTrack("R", S.rx, S.ry);
    trgHist.push({ l2: S.l2, r2: S.r2 }); if (trgHist.length > 240) trgHist.shift();
  }
  if (now - lastRate >= 1000) { rate = Math.round(samples * 1000 / (now - lastRate || 1000)); samples = 0; lastRate = now; }
  if (screen === "app") {
    const drawVisible = page === "overview" || page === "live";
    if (drawVisible) { if (view === "ds5") drawDs5(); else if (view === "ds4") drawDs4(); drawChips(); }
    if (page === "live") {
      $("bL2").style.width = S.l2 * 100 + "%"; $("vL2").textContent = Math.round(S.l2 * 100) + "%";
      $("bR2").style.width = S.r2 * 100 + "%"; $("vR2").textContent = Math.round(S.r2 * 100) + "%";
      drawTrgGraph();
      const usbS = src === "hid" && !!S.imu;
      $("cardTilt").classList.toggle("hidden", !usbS); $("cardTouch").classList.toggle("hidden", !usbS);
      if (usbS) { drawTouch(); drawImu(); }
      const stops = S.stopL2 !== null;
      $("stops").classList.toggle("hidden", !stops);
      if (stops) $("stops").textContent = t("edge.stops", { l: S.stopL2, r: S.stopR2 });
    }
    if (page === "sticks") {
      drawStick($("cvL"), S.lx, S.ly, sectors.L, stickMode, pathL);
      if (model?.sticks === 2) drawStick($("cvR"), S.rx, S.ry, sectors.R, stickMode, pathR);
      const f = (v) => (v >= 0 ? "+" : "") + v.toFixed(stickMode === "zoom" ? 3 : 2);
      $("aLX").textContent = f(S.lx); $("aLY").textContent = f(S.ly); $("aRX").textContent = f(S.rx); $("aRY").textContent = f(S.ry);
    }
    if (page === "debug") renderRaw();
    if (now - lastSlow > 200) {
      lastSlow = now; renderVal(); renderStatus(); renderKpis();
      if (page === "sticks") { $("readL").textContent = stickRead("L"); $("readR").textContent = stickRead("R"); }
    }
  }
  requestAnimationFrame(loop);
}

initUI();
setModel(MODELS.DS5);
refreshTexts();
showGate();
mountAds($("adSlot"), $("adMedia"), "ps5-web");
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
