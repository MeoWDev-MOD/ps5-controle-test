// Página inicial: reaproveita os efeitos e o banner do painel web.
import { initUI, themeSwitch } from "../web/js/ui.js";
import { mountAds } from "../web/js/banners.js";
import { initDemo } from "./phone.js";
import { initFx } from "./fx.js";
import { startShader } from "../web/js/shader.js";
import { initPageFx } from "../web/js/pagefx.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

initUI();
mountAds($("adSlot"), $("adMedia"), "ps5-site");

$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("ps5web.theme", next); } catch { /* modo privado */ }
});

initDemo($("demo"));

startShader($("fxBg"), isDark).start();
initPageFx("web/logo.png");
initFx();
