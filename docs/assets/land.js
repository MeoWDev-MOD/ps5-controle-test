// Página inicial: reaproveita os efeitos e o banner do painel web.
import { initUI, themeSwitch } from "../web/js/ui.js";
import { mountAds } from "../web/js/banners.js";
import { initDemo } from "./phone.js";

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

// seções entram suavemente ao rolar
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll(".rv").forEach((el) => io.observe(el));
