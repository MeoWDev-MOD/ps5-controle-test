// Movimento da página inicial: rolagem suave (Lenis), entrada e revelações ao rolar (GSAP).
// O conteúdo já nasce visível: se algo falhar ou o sistema pedir menos movimento, nada some.
"use strict";

function splitWords(h) {
  const wrap = (txt, cls) => txt.split(/(\s+)/).map((w) => (/^\s*$/.test(w) ? w : `<span class="w ${cls}">${w}</span>`)).join("");
  h.innerHTML = [...h.childNodes].map((n) => (n.nodeType === 3 ? wrap(n.textContent, "") : wrap(n.textContent, n.className))).join("");
  return h.querySelectorAll(".w");
}

export function initFx() {
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // rolagem suave só com mouse/trackpad: no toque, a rolagem nativa do celular é melhor
  if (Lenis && desktop) {
    const lenis = new Lenis({ lerp: 0.11, anchors: true }); // a folga do cabeçalho vem do scroll-padding-top
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // entrada da primeira dobra
  const words = splitWords(document.querySelector(".hero h1"));
  gsap.timeline({ defaults: { ease: "power3.out", clearProps: "transform,opacity,visibility" } })
    .from(".webcta", { y: -18, autoAlpha: 0, duration: 0.6 })
    .from(words, { yPercent: 55, autoAlpha: 0, duration: 0.65, stagger: 0.05 }, "-=0.35")
    .from(".hero .lead, .hero .cta, .hero .chips", { y: 18, autoAlpha: 0, duration: 0.55, stagger: 0.09 }, "-=0.4")
    .from(".card_box, .caption", { y: 44, autoAlpha: 0, duration: 0.85, stagger: 0.12 }, 0.2);

  // seções entram em cascata ao rolar
  const items = gsap.utils.toArray(".sec .h > *, .sec .card, .sec details, .sec > .cta");
  gsap.set(items, { y: 26, autoAlpha: 0 });
  ScrollTrigger.batch(items, {
    start: "top 92%", once: true,
    onEnter: (b) => gsap.to(b, { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out", stagger: 0.06, clearProps: "transform,opacity,visibility" }),
  });

  // barra de progresso e aba ativa no menu
  gsap.to("#scrollBar", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
  document.querySelectorAll(".links a[href^='#']").forEach((a) => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec) ScrollTrigger.create({ trigger: sec, start: "top 45%", end: "bottom 45%", toggleClass: { targets: a, className: "on" } });
  });

  if (!desktop) return;
  // celular: flutua devagar ao rolar e inclina de leve seguindo o mouse
  const stage = document.getElementById("phoneHero"), hero = document.querySelector(".hero");
  gsap.set(stage, { transformPerspective: 1000 });
  gsap.to(stage, { y: -46, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.5 } });
  const rx = gsap.quickTo(stage, "rotationX", { duration: 0.6, ease: "power3" }), ry = gsap.quickTo(stage, "rotationY", { duration: 0.6, ease: "power3" });
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    ry(((e.clientX - r.left) / r.width - 0.5) * 7);
    rx(-((e.clientY - r.top) / r.height - 0.5) * 5);
  }, { passive: true });
  hero.addEventListener("pointerleave", () => { rx(0); ry(0); });
}
