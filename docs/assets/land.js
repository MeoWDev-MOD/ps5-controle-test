// Página inicial: reaproveita os efeitos e o banner do painel web.
import { initUI, themeSwitch } from "../web/js/ui.js";
import { mountAds } from "../web/js/banners.js";
import { initDemo } from "./phone.js";
import { initFx } from "./fx.js";
import { startShader } from "../web/js/shader.js";
import { initPageFx } from "../web/js/pagefx.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const classes = root.classList;

// Celular e tablet: o texto principal e os botões levam a baixar o app.
function mobileFocus() {
  if (!classes.contains("m")) return;
  const h1 = document.querySelector(".hero h1"), lead = document.querySelector(".hero .lead");
  if (classes.contains("ios")) {
    h1.innerHTML = 'Teste seu controle <span class="grad">no computador ou no Android</span>.';
    lead.textContent = "Este aparelho faz só o teste básico pelo navegador. Para testar tudo e calibrar, abra este site num computador com Chrome ou Edge, ou use nosso app num celular Android.";
    return;
  }
  h1.innerHTML = 'Seu controle testado <span class="grad">direto no celular</span>.';
  lead.textContent = "Baixe o app, ligue o controle pelo cabo USB e descubra na hora se ele está bom: botões, analógicos, drift, gatilhos, vibração e som. Também calibra, sem precisar de computador.";
  // botão fixo aparece quando o botão principal sai da tela
  const bar = $("mDl"), main = document.querySelector('.hero .cta a[href$=".apk"]');
  new IntersectionObserver(([e]) => bar.classList.toggle("on", !e.isIntersecting)).observe(main);
  // links para o testador avisam antes de sair
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href="web/"]');
    if (!a || a.hasAttribute("data-ok")) return;
    e.preventDefault(); e.stopPropagation();
    $("mDlg").showModal();
  }, true);
  $("mDlg").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}

const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

initUI();
mountAds($("adSlot"), $("adMedia"), "ps5-site");

$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("ps5web.theme", next); } catch { /* modo privado */ }
});

initDemo($("demo"));

mobileFocus();
startShader($("fxBg"), isDark).start();
initPageFx("web/logo-xl.webp");
initFx();
