// Página inicial: reaproveita os efeitos e o banner do painel web.
import { initUI, themeSwitch } from "../web/js/ui.js";
import { mountAds } from "../web/js/banners.js";
import { mountConsent } from "../web/js/consent.js";
import { initDemo } from "./phone.js";
import { initFx } from "./fx.js";
import { startShader } from "../web/js/shader.js";
import { initPageFx } from "../web/js/pagefx.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const classes = root.classList;
// Textos do celular no idioma da página (<html lang>; as páginas en/, es/ e ru/ saem de site-src/i18n).
const TX = {"pt": ["Teste seu controle <span class=\"grad\">no computador ou no Android</span>.", "Este aparelho faz só o teste básico pelo navegador. Para testar tudo e calibrar, abra este site num computador com Chrome ou Edge, ou use nosso app num celular Android.", "Seu controle testado <span class=\"grad\">direto no celular</span>.", "Baixe o app, ligue o controle pelo cabo USB e descubra na hora se ele está bom: botões, analógicos, drift, gatilhos, vibração e som. Também calibra, sem precisar de computador."], "en": ["Test your controller <span class=\"grad\">on a computer or on Android</span>.", "This device only runs the basic test through the browser. To test everything and calibrate, open this website on a computer with Chrome or Edge, or use our app on an Android phone.", "Your controller tested <span class=\"grad\">right on your phone</span>.", "Download the app, plug the controller in with the USB cable and find out right away if it is good: buttons, sticks, drift, triggers, vibration and sound. It also calibrates, with no computer needed."], "es": ["Prueba tu control <span class=\"grad\">en la computadora o en Android</span>.", "Este dispositivo hace solo la prueba básica por el navegador. Para probar todo y calibrar, abre este sitio en una computadora con Chrome o Edge, o usa nuestra app en un celular Android.", "Tu control probado <span class=\"grad\">directo en el celular</span>.", "Descarga la app, conecta el control por el cable USB y descubre al instante si está bien: botones, analógicos, drift, gatillos, vibración y sonido. También calibra, sin necesidad de computadora."], "ru": ["Проверьте геймпад <span class=\"grad\">на компьютере или на Android</span>.", "Это устройство выполняет только базовую проверку через браузер. Чтобы проверить всё и откалибровать, откройте сайт на компьютере в Chrome или Edge либо используйте наше приложение на телефоне с Android.", "Ваш геймпад проверен <span class=\"grad\">прямо на телефоне</span>.", "Скачайте приложение, подключите геймпад USB-кабелем и сразу узнайте, исправен ли он: кнопки, стики, дрифт, триггеры, вибрация и звук. Калибрует тоже — компьютер не нужен."]};
const tx = TX[(root.lang || "pt").slice(0, 2)] ?? TX.pt;

// Celular e tablet: o texto principal e os botões levam a baixar o app.
function mobileFocus() {
  if (!classes.contains("m")) return;
  const h1 = document.querySelector(".hero h1"), lead = document.querySelector(".hero .lead");
  if (classes.contains("ios")) {
    h1.innerHTML = tx[0];
    lead.textContent = tx[1];
    return;
  }
  h1.innerHTML = tx[2];
  lead.textContent = tx[3];
  // botão fixo aparece quando o botão principal sai da tela
  const bar = $("mDl"), main = document.querySelector('.hero .cta a[href$=".apk"]');
  new IntersectionObserver(([e]) => bar.classList.toggle("on", !e.isIntersecting)).observe(main);
  // links para o testador avisam antes de sair
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href$="web/"]');
    if (!a || a.hasAttribute("data-ok")) return;
    e.preventDefault(); e.stopPropagation();
    $("mDlg").showModal();
  }, true);
  $("mDlg").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}

const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);

initUI();
mountConsent();
mountAds($("adSlot"), $("adMedia"), "ps5-site");

$("themeBtn").onclick = (e) => themeSwitch(e, () => {
  const next = isDark() ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("ps5web.theme", next); } catch { /* modo privado */ }
});

initDemo($("demo"));

mobileFocus();
startShader($("fxBg"), isDark).start();
initPageFx(new URL("../web/logo-xl.webp", import.meta.url).href);
initFx();
