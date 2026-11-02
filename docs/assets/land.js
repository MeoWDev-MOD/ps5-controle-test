// Página inicial: reaproveita os efeitos e o banner do painel web.
import { initUI, themeSwitch } from "../web/js/ui.js";
import { mountAds } from "../web/js/banners.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

initUI();
mountAds($("adSlot"), $("adMedia"));

$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("ps5web.theme", next); } catch { /* modo privado */ }
});

// botões do controle acendem em sequência dentro do celular ilustrado
const spots = [...document.querySelectorAll("#phoneDs .hit")];
const done = $("phoneDone"), bar = $("phoneBar");
let n = 0;
if (spots.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setInterval(() => {
    if (n === spots.length) { spots.forEach((s) => s.classList.remove("on")); n = 0; }
    else { spots[n].classList.add("on"); n++; }
    done.textContent = `${n} de ${spots.length}`;
    bar.style.transform = `scaleX(${n / spots.length})`;
  }, 700);
} else if (spots.length) { spots.forEach((s) => s.classList.add("on")); done.textContent = `${spots.length} de ${spots.length}`; bar.style.transform = "scaleX(1)"; }

// seções entram suavemente ao rolar
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll(".rv").forEach((el) => io.observe(el));
