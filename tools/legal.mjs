// Textos dos Termos de uso e da página de Privacidade e cookies, nos 3 idiomas.
// Mudou algo que a pessoa precisa aceitar de novo? Troque também TERMS_VERSION em docs/web/js/consent.js.
// Depois, rode: node tools/gerar-seo.mjs
export const UPDATED = {
  pt: "Atualizado em 2 de novembro de 2026.",
  en: "Updated on November 2, 2026.",
  es: "Actualizado el 2 de noviembre de 2026.",
};

const LICENSES = '<a href="../web/licencas/dualshock-tools-MIT.txt">dualshock-tools (MIT)</a>';
const WHATSAPP = '<a href="https://wa.me/5521966547296" target="_blank" rel="noopener">WhatsApp +55 21 96654-7296</a>';

export const TERMS = {
  pt: {
    title: "Termos de uso",
    sections: [
      ["O que é", "O PS-5 Controle Test é uma ferramenta para testar e calibrar controles de PlayStation. A versão no navegador é grátis. O app para Android é vendido à parte, com teste grátis e plano anual. O projeto é mantido por MeoWDeV MOD (Jefferson Honorio)."],
      ["Aceite", "Ao clicar em aceitar, você concorda com estes termos. Se não concordar, não use a ferramenta."],
      ["Calibração e riscos", "A calibração grava dados na memória do controle. Use só em controle seu ou com autorização do dono, não desconecte durante o processo e confira o resultado antes de salvar. A calibração não conserta drift causado por peças gastas. Em controle paralelo (não original), ela não funciona e pode travar o controle."],
      ["Sem garantia", "A ferramenta é oferecida como está, sem garantia de funcionar em todo controle, navegador ou computador. Na medida permitida pela lei, não respondemos por defeitos, perda de calibração ou outros danos causados pelo uso. Isso não retira direitos que a lei garante ao consumidor."],
      ["Laudo", "O laudo mostra os testes feitos naquela sessão, naquele momento. Não é certificado da Sony nem de outro fabricante, e quem o emite responde pelo uso que faz dele."],
      ["Anúncios e links", "O site mostra anúncios e links de terceiros. O que você comprar ou contratar nesses sites é de responsabilidade deles."],
      ["Uso permitido", "Não use a ferramenta para falsificar laudos, enganar compradores, atacar o site ou desrespeitar a lei."],
      ["Marcas e licenças", `PlayStation, PS5, DualSense e DualShock são marcas da Sony Interactive Entertainment. Este projeto não é afiliado à Sony. Desenhos e comandos de terceiros seguem as próprias licenças: ${LICENSES}.`],
      ["Mudanças", "Podemos atualizar estes termos. Quando isso acontecer, o site pedirá um novo aceite."],
      ["Lei e contato", `Estes termos seguem as leis do Brasil. Para falar com a gente: ${WHATSAPP}.`],
    ],
  },
  en: {
    title: "Terms of use",
    sections: [
      ["What this is", "PS-5 Controle Test is a tool for testing and calibrating PlayStation controllers. The browser version is free. The Android app is sold separately, with a free trial and a yearly plan. The project is maintained by MeoWDeV MOD (Jefferson Honorio)."],
      ["Acceptance", "By clicking accept, you agree to these terms. If you do not agree, do not use the tool."],
      ["Calibration and risks", "Calibration writes data to the controller's memory. Use it only on your own controller or with the owner's permission, do not disconnect during the process, and check the result before saving. Calibration does not fix drift caused by worn parts. On clone (non-genuine) controllers it does not work and may freeze the controller."],
      ["No warranty", "The tool is provided as is, with no guarantee that it works on every controller, browser or computer. To the extent permitted by law, we are not liable for defects, lost calibration or other damage caused by its use. This does not remove rights that the law grants to consumers."],
      ["Report", "The report shows the tests done in that session, at that moment. It is not a certificate from Sony or any other manufacturer, and whoever issues it is responsible for how it is used."],
      ["Ads and links", "The site shows third-party ads and links. Anything you buy or hire on those sites is their responsibility."],
      ["Allowed use", "Do not use the tool to forge reports, deceive buyers, attack the site or break the law."],
      ["Trademarks and licenses", `PlayStation, PS5, DualSense and DualShock are trademarks of Sony Interactive Entertainment. This project is not affiliated with Sony. Third-party drawings and commands follow their own licenses: ${LICENSES}.`],
      ["Changes", "We may update these terms. When that happens, the site will ask you to accept them again."],
      ["Law and contact", `These terms follow the laws of Brazil. To reach us: ${WHATSAPP}.`],
    ],
  },
  es: {
    title: "Términos de uso",
    sections: [
      ["Qué es", "PS-5 Controle Test es una herramienta para probar y calibrar controles de PlayStation. La versión en el navegador es gratis. La app para Android se vende aparte, con prueba gratis y plan anual. El proyecto lo mantiene MeoWDeV MOD (Jefferson Honorio)."],
      ["Aceptación", "Al hacer clic en aceptar, estás de acuerdo con estos términos. Si no estás de acuerdo, no uses la herramienta."],
      ["Calibración y riesgos", "La calibración graba datos en la memoria del control. Úsala solo en un control tuyo o con permiso del dueño, no lo desconectes durante el proceso y revisa el resultado antes de guardar. La calibración no arregla el drift causado por piezas gastadas. En controles clon (no originales) no funciona y puede bloquear el control."],
      ["Sin garantía", "La herramienta se ofrece tal cual, sin garantía de que funcione en todo control, navegador u ordenador. En la medida que permita la ley, no respondemos por defectos, pérdida de calibración u otros daños causados por el uso. Esto no quita los derechos que la ley da a los consumidores."],
      ["Informe", "El informe muestra las pruebas hechas en esa sesión, en ese momento. No es un certificado de Sony ni de otro fabricante, y quien lo emite responde por el uso que hace de él."],
      ["Anuncios y enlaces", "El sitio muestra anuncios y enlaces de terceros. Lo que compres o contrates en esos sitios es responsabilidad de ellos."],
      ["Uso permitido", "No uses la herramienta para falsificar informes, engañar a compradores, atacar el sitio o incumplir la ley."],
      ["Marcas y licencias", `PlayStation, PS5, DualSense y DualShock son marcas de Sony Interactive Entertainment. Este proyecto no está afiliado a Sony. Los dibujos y comandos de terceros siguen sus propias licencias: ${LICENSES}.`],
      ["Cambios", "Podemos actualizar estos términos. Cuando eso ocurra, el sitio pedirá una nueva aceptación."],
      ["Ley y contacto", `Estos términos siguen las leyes de Brasil. Para hablar con nosotros: ${WHATSAPP}.`],
    ],
  },
};

const code = (s) => `<code>${s}</code>`;

export const PRIVACY = {
  pt: {
    title: "Privacidade e cookies",
    sections: [
      ["Resumo", "Este site não usa cookies de rastreamento nem ferramentas de análise de terceiros, como o Google Analytics. O que chamamos de cookies aqui é, na prática, o armazenamento do seu navegador: pequenas informações que ficam no seu aparelho."],
      ["Sempre ativos (necessários)", `<ul><li>Sua escolha de termos e cookies (${code("ps5web.consent")}).</li><li>Idioma e tema (${code("ps5web.lang")}, ${code("ps5web.theme")}).</li><li>Cópia dos arquivos do testador, para abrir sem internet.</li><li>Efeito de transição entre páginas (${code("ps5.pt")}), que some ao fechar a aba.</li></ul>`],
      ["Opcionais (só com Aceitar tudo)", `<ul><li>Último controle conectado: modelo, número de série, placa e cor (${code("ps5web.last")}), e o aviso de calibração não salva (${code("ps5web.unsaved.*")}).</li><li>Histórico para restaurar a calibração (${code("ps5web.fineHistory")}).</li><li>Último anúncio visto, para mostrar outro na próxima visita, e quais anúncios este navegador já viu (${code("ps5-ad-*")}).</li><li>Site de onde você veio (${code("ps5-de")}), que some ao fechar a aba.</li><li>Contagem dos anúncios, explicada abaixo.</li></ul>`],
      ["Se você escolher só o necessário", "Os itens opcionais não ficam salvos: o histórico de calibração vale só enquanto a página estiver aberta. Os anúncios continuam aparecendo, mas exibições e cliques não são contados. A troca de escolha apaga os opcionais deste navegador."],
      ["Contagem dos anúncios", "Com a sua autorização, avisamos ao nosso servidor quando um anúncio aparece ou é clicado, em qual lugar do site e de qual site você veio. O servidor soma esses avisos por dia, com cidade e país aproximados e tipo de aparelho. Não guardamos seu IP nem criamos um identificador seu."],
      ["Dados do controle", "O que o site lê do controle, como o número de série, fica no seu navegador. Essas informações não são enviadas para nós."],
      ["Serviços usados", 'O site é hospedado no GitHub Pages. A lista e os arquivos dos anúncios vêm da Vercel e do Supabase. Como em qualquer site, esses serviços recebem seu IP e dados técnicos para entregar o conteúdo. WhatsApp, Instagram e YouTube só recebem dados se você clicar nos links deles.'],
      ["App para Android", "Esta página trata do site. O app para Android envia ao nosso servidor um código do aparelho, o modelo e a versão, para controlar a licença. Cliques em anúncios dentro do app também são somados, sem identificar você."],
      ["Seus direitos", `Você pode mudar sua escolha a qualquer momento em Gerenciar cookies, no fim das páginas, e pedir informações pela LGPD. Responsável: MeoWDeV MOD (Jefferson Honorio). Contato: ${WHATSAPP}.`],
    ],
  },
  en: {
    title: "Privacy and cookies",
    sections: [
      ["Summary", "This site does not use tracking cookies or third-party analytics tools such as Google Analytics. What we call cookies here is, in practice, your browser's storage: small pieces of information kept on your device."],
      ["Always on (necessary)", `<ul><li>Your terms and cookies choice (${code("ps5web.consent")}).</li><li>Language and theme (${code("ps5web.lang")}, ${code("ps5web.theme")}).</li><li>A copy of the tester's files, so it opens offline.</li><li>Page transition effect (${code("ps5.pt")}), removed when you close the tab.</li></ul>`],
      ["Optional (only with Accept all)", `<ul><li>Last connected controller: model, serial number, board and color (${code("ps5web.last")}), and the unsaved calibration warning (${code("ps5web.unsaved.*")}).</li><li>History for restoring calibration (${code("ps5web.fineHistory")}).</li><li>Last ad seen, to show a different one on your next visit, and which ads this browser has already seen (${code("ps5-ad-*")}).</li><li>The site you came from (${code("ps5-de")}), removed when you close the tab.</li><li>Ad counting, explained below.</li></ul>`],
      ["If you choose only what's necessary", "Optional items are not saved: the calibration history lasts only while the page is open. Ads still appear, but views and clicks are not counted. Changing your choice deletes the optional items from this browser."],
      ["Ad counting", "With your permission, we tell our server when an ad appears or is clicked, where on the site, and which site you came from. The server adds these up per day, with approximate city and country and device type. We do not keep your IP address or create an identifier for you."],
      ["Controller data", "What the site reads from the controller, such as the serial number, stays in your browser. That information is not sent to us."],
      ["Services used", "The site is hosted on GitHub Pages. The list and files of ads come from Vercel and Supabase. As with any website, these services receive your IP address and technical data to deliver the content. WhatsApp, Instagram and YouTube only receive data if you click their links."],
      ["Android app", "This page covers the site. The Android app sends our server a device code, the model and the version, to manage the license. Ad clicks inside the app are also added up, without identifying you."],
      ["Your rights", `You can change your choice at any time under Manage cookies, at the bottom of the pages, and request information under Brazil's data protection law (LGPD). Responsible: MeoWDeV MOD (Jefferson Honorio). Contact: ${WHATSAPP}.`],
    ],
  },
  es: {
    title: "Privacidad y cookies",
    sections: [
      ["Resumen", "Este sitio no usa cookies de rastreo ni herramientas de análisis de terceros, como Google Analytics. Lo que aquí llamamos cookies es, en la práctica, el almacenamiento de tu navegador: pequeñas informaciones que quedan en tu dispositivo."],
      ["Siempre activos (necesarios)", `<ul><li>Tu elección de términos y cookies (${code("ps5web.consent")}).</li><li>Idioma y tema (${code("ps5web.lang")}, ${code("ps5web.theme")}).</li><li>Copia de los archivos del probador, para abrir sin internet.</li><li>Efecto de transición entre páginas (${code("ps5.pt")}), que se borra al cerrar la pestaña.</li></ul>`],
      ["Opcionales (solo con Aceptar todo)", `<ul><li>Último control conectado: modelo, número de serie, placa y color (${code("ps5web.last")}), y el aviso de calibración sin guardar (${code("ps5web.unsaved.*")}).</li><li>Historial para restaurar la calibración (${code("ps5web.fineHistory")}).</li><li>Último anuncio visto, para mostrar otro en la próxima visita, y qué anuncios ya vio este navegador (${code("ps5-ad-*")}).</li><li>Sitio del que vienes (${code("ps5-de")}), que se borra al cerrar la pestaña.</li><li>Conteo de anuncios, explicado abajo.</li></ul>`],
      ["Si eliges solo lo necesario", "Los elementos opcionales no se guardan: el historial de calibración dura solo mientras la página esté abierta. Los anuncios siguen apareciendo, pero las vistas y los clics no se cuentan. Cambiar tu elección borra los opcionales de este navegador."],
      ["Conteo de anuncios", "Con tu permiso, avisamos a nuestro servidor cuando un anuncio aparece o recibe un clic, en qué lugar del sitio y de qué sitio vienes. El servidor suma estos avisos por día, con ciudad y país aproximados y tipo de dispositivo. No guardamos tu IP ni creamos un identificador tuyo."],
      ["Datos del control", "Lo que el sitio lee del control, como el número de serie, queda en tu navegador. Esa información no se nos envía."],
      ["Servicios usados", "El sitio está alojado en GitHub Pages. La lista y los archivos de los anuncios vienen de Vercel y Supabase. Como en cualquier sitio, estos servicios reciben tu IP y datos técnicos para entregar el contenido. WhatsApp, Instagram y YouTube solo reciben datos si haces clic en sus enlaces."],
      ["App para Android", "Esta página trata del sitio. La app para Android envía a nuestro servidor un código del dispositivo, el modelo y la versión, para gestionar la licencia. Los clics en anuncios dentro de la app también se suman, sin identificarte."],
      ["Tus derechos", `Puedes cambiar tu elección en cualquier momento en Gestionar cookies, al final de las páginas, y pedir información según la ley de datos de Brasil (LGPD). Responsable: MeoWDeV MOD (Jefferson Honorio). Contacto: ${WHATSAPP}.`],
    ],
  },
};
