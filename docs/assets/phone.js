// Mini celular da página inicial: telas reais do app, com os botões funcionando por cima delas.
// Nenhum controle é lido e nada é gravado. Para atualizar, capture as telas de novo.
import { DATA } from "./phone-data.js";

export const TABS = ["Controle", "Validação", "Calibração", "Novidades"];
export const ITEMS = ["Conector USB", "Botões", "Analógicos", "Trackpad", "IMU", "Gatilho Adaptável", "Vibração Háptica", "Luzes", "Alto-falante", "Fone de Ouvido", "Microfone"];
const MODES = ["Normal", "Zoom 10x", "Circularidade"];
const RESULT = { pass: ["Passou", "#4ade80"], fail: ["Falhou", "#fb7185"], skip: ["Pulado", "#fbbf24"] };
const SOCIAL = [
  ["ig", "@tech_meow.oficial", "https://www.instagram.com/tech_meow.oficial"],
  ["ig", "@honorio.dev", "https://www.instagram.com/honorio.dev"],
  ["yt", "YouTube @techmeow", "https://www.youtube.com/@techmeow"],
  ["wa", "WhatsApp", "https://wa.me/5521966547296?text=Ol%C3%A1!%20Vim%20pelo%20app%20PS-5%20Controle%20Test."],
  ["gh", "GitHub MeoWDev-MOD", "https://github.com/MeoWDev-MOD"],
];
// O que cada botão do item aberto responde no app
const ACTIONS = {
  1: ["No USB direto isso já é lido automaticamente", "No USB direto isso já é lido automaticamente"],
  2: ["Solte os analógicos…"],
  5: ["Puxe L2 e R2", "Efeito desligado"],
  6: ["Vibrando: esquerda ⇄ direita"],
  7: ["Barra de luz: vermelho, verde, azul e branco"],
  8: ["Tom enviado ao alto-falante do controle…"],
  9: ["Tom enviado ao fone (P2) do controle…"],
  10: ["Fale ou sopre no microfone do controle…"],
};
const TOTAL = 21; // 17 botões + touchpad + Mute + 2 analógicos, como no app

// ---- regras (sem tela, para poder testar)
export const imgSrc = (key) => `assets/app/${key}.jpg`;
export const valScreen = (open) => (open < 0 ? "vx" : "v" + open);
export const calScreen = (st, mode) => (st ? "k" + st : mode ? "kz" + mode : "k0");
export const nextOpen = (res) => res.findIndex((r) => !r);
export function summaryText(res) {
  const n = (r) => res.filter((x) => x === r).length;
  if (n(null) === res.length) return "";
  return `${n("pass")} passou · ${n("fail")} falhou · ${n("skip")} pulado · ${n(null)} sem testar`;
}
export const testedCount = (t) => t.size + (t.has("ds_l3") ? 1 : 0) + (t.has("ds_r3") ? 1 : 0);

const pct = (s, h) => `left:${s.x / 10.8}%;top:${(s.y / h) * 100}%;width:${s.w / 10.8}%;height:${(s.h / h) * 100}%`;

export function initDemo(root) {
  root.innerHTML = `
    <i class="island" aria-hidden="true"></i>
    <div class="atop"><img class="ahead" src="${imgSrc("head")}" alt="" width="1080" height="${DATA.headH}"></div>
    <div class="ascroll" tabindex="0" aria-label="Tela do app, role para ver mais"><div class="astage"><img id="aPage" src="${imgSrc("c0")}" alt="Tela Controle do app" width="1080" height="${DATA.screens.c0.h}"><div id="aLayer"></div></div></div>
    <div class="anav"><img id="aNav" src="${imgSrc("nav0")}" alt="" width="1080" height="277"><div class="atabs">${TABS.map((t, i) => `<button data-tab="${i}" aria-label="Abrir aba ${t}" aria-pressed="${!i}"></button>`).join("")}</div></div>
    <div class="adlg hidden" id="aDlg"></div>
    <div class="atoast" id="aToast" role="status"></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const page = $("aPage"), layer = $("aLayer"), nav = $("aNav"), box = root.querySelector(".ascroll"), dlg = $("aDlg");
  box.style.setProperty("--hh", `${DATA.headH / 10.8}%`);
  const st = { tab: 0, scroll: [0, 0, 0, 0], mode: 0, tested: new Set(), saved: false, drift: false, open: 0, res: Array(ITEMS.length).fill(null), cal: 0, calMode: 0 };
  let token = 0, toastT = 0;

  const toast = (s, ms = 2200) => { const t = $("aToast"); t.textContent = s; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), ms); };
  const buzz = () => { const p = root.closest(".phone"); p.classList.remove("buzz"); void p.offsetWidth; p.classList.add("buzz"); };
  const screen = () => [`c${st.mode}`, valScreen(st.open), calScreen(st.cal, st.calMode), "n0"][st.tab];
  const hot = (s, h, a, label) => `<button class="hot" style="${pct(s, h)}" data-a="${a}" aria-label="${label}"></button>`;

  function overlays(key) {
    const { spots: s, h } = DATA.screens[key];
    let o = "";
    if (st.tab === 0) {
      o += `<div class="ads" style="${pct(s.ds, h)}">${DATA.sprites.map((p) => `<button class="spr${st.tested.has(p.n) ? " done" : ""}" data-s="${p.n}" aria-label="${p.a}" style="left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%"><img src="web/ds/${p.n}.png" alt=""></button>`).join("")}</div>`;
      o += `<i class="abar" id="aBar" style="${pct(s.bar, h)}"><b style="transform:scaleX(${testedCount(st.tested) / TOTAL})"></b></i>`;
      o += hot(s.vib, h, "vib", "Vibrar") + hot(s.drift, h, "drift", "Testar drift") + hot(s.save, h, "save", "Salvar teste") + hot(s.hist, h, "hist", "Histórico") + hot(s.reset, h, "reset", "Zerar testes");
      MODES.forEach((m, i) => { o += hot(s["mode" + i], h, "mode" + i, m); });
      if (st.drift) o += `<i class="hotdim" style="${pct(s.drift, h)}"></i>`;
    } else if (st.tab === 1) {
      ITEMS.forEach((t, i) => {
        o += hot(s["item" + i], h, "item" + i, t);
        const r = st.res[i], b = s["badge" + i];
        if (r) o += `<em class="abadge" style="${pct(b, h)};--c:${RESULT[r][1]}">${RESULT[r][0]}</em>`;
      });
      if (s.pass) o += hot(s.pass, h, "r:pass", "Passou") + hot(s.fail, h, "r:fail", "Falha") + hot(s.skip, h, "r:skip", "Pular");
      (ACTIONS[st.open] || []).forEach((_, i) => { if (s["act" + i]) o += hot(s["act" + i], h, "act" + i, "Ação do teste"); });
      o += hot(s.restart, h, "restart", "Reiniciar validação");
      const sum = summaryText(st.res);
      if (sum) o += `<p class="asum" style="left:${s.summary.x / 10.8}%;right:0;top:${(s.summary.y / h) * 100}%;height:${(s.summary.h / h) * 100}%">${sum}</p>`;
    } else if (st.tab === 2) {
      o += hot(s.center, h, "center", "Calibrar centro") + hot(s.range, h, "range", "Calibrar alcance");
      if (st.cal === 1 || st.cal === 2) o += hot(s.keep, h, "keep", "Salvar no controle");
      MODES.forEach((m, i) => { o += hot(s["mode" + i], h, "cmode" + i, m); });
    } else {
      SOCIAL.forEach(([k, t, url], i) => {
        const b = s["soc" + i];
        o += `<a class="asoc ${k}" href="${url}" target="_blank" rel="noopener" aria-label="${t}" style="left:${(b.x + b.w / 2) / 10.8}%;top:${((b.y + b.h / 2) / h) * 100}%"><i></i><svg viewBox="0 0 24 24"><use href="#s-${k}"/></svg><span>${t}</span></a>`;
      });
      o += hot(s.update, h, "update", "Verificar atualizações");
    }
    return o;
  }

  async function render(soft) {
    const key = screen(), mine = ++token, im = new Image();
    im.src = imgSrc(key);
    try { await im.decode(); } catch { /* mostra assim mesmo */ }
    if (mine !== token) return;
    page.src = im.src; page.alt = `Tela ${TABS[st.tab]} do app`;
    page.height = DATA.screens[key].h;
    nav.src = imgSrc("nav" + st.tab);
    layer.innerHTML = overlays(key);
    if (soft) { box.classList.remove("fade"); void box.offsetWidth; box.classList.add("fade"); }
  }

  // ---- janelas de confirmação reais
  function openDialog(key, handlers) {
    const d = DATA.dialogs[key], close = () => { dlg.classList.add("hidden"); dlg.innerHTML = ""; root.removeEventListener("keydown", esc); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    $("aToast").classList.remove("on");
    dlg.innerHTML = `<div class="abox" role="dialog" aria-modal="true" style="width:${(d.w / 1080) * 100}%"><img src="${imgSrc(key)}" alt="" width="${d.w}" height="${d.h}">${Object.values(d.spots)
      .map((s) => `<button class="hot" data-l="${s.label}" aria-label="${s.label}" style="left:${(s.x / d.w) * 100}%;top:${(s.y / d.h) * 100}%;width:${(s.w / d.w) * 100}%;height:${(s.h / d.h) * 100}%"></button>`).join("")}</div>`;
    dlg.classList.remove("hidden");
    dlg.onclick = (e) => {
      if (e.target === dlg) return close();
      const b = e.target.closest("[data-l]"); if (!b) return;
      close(); handlers[b.dataset.l]?.();
    };
    root.addEventListener("keydown", esc);
    dlg.querySelector("button").focus();
  }

  function reveal() {
    const key = screen(), s = DATA.screens[key].spots["item" + st.open]; if (!s) return;
    const k = box.clientWidth / 1080, top = s.y * k;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight * 0.45) box.scrollTo({ top: top - 6, behavior: "smooth" });
  }

  function runDrift() {
    if (st.drift) return;
    st.drift = true; render();
    let s = 3;
    const tick = () => {
      if (s > 0) { toast(`Solte os analógicos… ${s}s`, 1200); s--; setTimeout(tick, 1000); return; }
      st.drift = false; render(); toast("Exemplo de resultado: drift 0,00 nos dois analógicos", 3000);
    };
    tick();
  }

  const act = {
    vib: () => { buzz(); toast("Vibrando: esquerda ⇄ direita"); },
    drift: runDrift,
    save: () => { st.saved = true; toast("Teste salvo no histórico"); },
    hist: () => st.saved
      ? openDialog("dHist1", { Compartilhar: () => toast("No app, abre o WhatsApp e outros apps"), Limpar: () => { st.saved = false; toast("Histórico apagado"); } })
      : openDialog("dHist0", {}),
    reset: () => openDialog("dReset", { "Zerar testes": () => { st.tested.clear(); render(); } }),
    restart: () => openDialog("dRestart", { "Reiniciar validação": () => { st.res.fill(null); st.open = 0; box.scrollTop = 0; render(true); } }),
    center: () => openDialog("dCenter", { Começar: () => { st.cal = 1; st.calMode = 0; render(true); } }),
    range: () => openDialog("dRange", { Começar: () => { st.cal = 2; st.calMode = 0; render(true); } }),
    keep: () => openDialog("dSave", { "Salvar no controle": () => { st.cal = 3; render(true); toast("Demonstração: nada foi gravado"); } }),
    update: () => toast("Você já está na versão mais recente"),
  };

  async function doAction(a) {
    if (act[a]) return act[a]();
    if (a.startsWith("mode")) { st.mode = +a.slice(4); return render(true); }
    if (a.startsWith("cmode")) {
      if (st.cal) return toast("Nesta demonstração, troque o modo antes de calibrar");
      st.calMode = +a.slice(5); return render(true);
    }
    if (a.startsWith("item")) { const i = +a.slice(4); st.open = st.open === i ? -1 : i; await render(true); return reveal(); }
    if (a.startsWith("r:")) { st.res[st.open] = a.slice(2); st.open = nextOpen(st.res); await render(true); return reveal(); }
    if (a.startsWith("act")) { const m = ACTIONS[st.open]?.[+a.slice(3)]; if (st.open === 6) buzz(); if (st.open === 2) return runDrift(); return m && toast(m); }
  }

  // ---- toques
  root.querySelector(".atabs").onclick = (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    const i = +b.dataset.tab; if (i === st.tab) return;
    st.scroll[st.tab] = box.scrollTop;
    box.classList.remove("right", "left", "fade"); void box.offsetWidth;
    box.classList.add(i > st.tab ? "right" : "left");
    st.tab = i;
    root.querySelectorAll("[data-tab]").forEach((x, k) => x.setAttribute("aria-pressed", k === i));
    render().then(() => { box.scrollTop = st.scroll[i]; });
  };
  layer.addEventListener("click", (e) => { const b = e.target.closest("[data-a]"); if (b) doAction(b.dataset.a); });
  // botão do desenho: aceso enquanto está apertado, fraco depois de testado (igual ao app)
  const release = () => layer.querySelectorAll(".spr.on").forEach((x) => x.classList.remove("on"));
  layer.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    b.classList.add("on", "done"); st.tested.add(b.dataset.s);
    const f = $("aBar")?.firstElementChild; if (f) f.style.transform = `scaleX(${testedCount(st.tested) / TOTAL})`;
  });
  layer.addEventListener("keydown", (e) => { if (e.target.closest("[data-s]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); setTimeout(release, 180); } });
  addEventListener("pointerup", release); addEventListener("pointercancel", release);

  // as outras telas só baixam quando a pessoa chega perto do celular
  const preload = () => [...Object.keys(DATA.screens), ...Object.keys(DATA.dialogs), "nav1", "nav2", "nav3"].forEach((k) => { new Image().src = imgSrc(k); });
  root.addEventListener("pointerenter", preload, { once: true });
  root.addEventListener("touchstart", preload, { once: true, passive: true });
  root.addEventListener("focusin", preload, { once: true });

  render();
}
