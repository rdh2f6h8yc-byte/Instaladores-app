// Borna · iconos propios. Cambia los emojis de la interfaz por iconos de trazo,
// que se ven igual en todos los móviles. Funciona también con lo que se pinta después (listas, avisos).
(function () {
  "use strict";
  const P = {
    cliente: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.6c2 .7 3.5 2.4 3.5 5.4"/>',
    presupuesto: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M14.6 11.3a3.2 3.2 0 1 0 0 5.4"/><path d="M9.6 13.3h4M9.6 14.9h4"/>',
    parte: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    plano: '<path d="M4 4h16v16H4z"/><path d="M4 12h7v8"/><path d="M11 4v4.5"/><path d="M15 12h5"/>',
    material: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5"/><path d="M12 12v9"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    estadisticas: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16V9"/>',
    ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    tecnico: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0"/><path d="M5 10h14"/><path d="M8.5 10.5a3.5 3.5 0 0 0 7 0"/><path d="M5 21c0-3.6 3-5.5 7-5.5s7 1.9 7 5.5"/>',
    enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
    aviso: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.5"/>',
    revision: '<path d="M14.7 3.6a5 5 0 0 0-5.5 6.6l-5.4 5.4a2 2 0 0 0 2.8 2.8l5.4-5.4a5 5 0 0 0 6.6-5.5l-2.9 2.9-2.8-.4-.4-2.8z"/>',
    lista: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="m8.5 11 1.5 1.5 2.5-2.5M14 11.5h1.5M8.5 16.5h7"/>',
    camara: '<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
    firma: '<path d="M4 20c2.5-2.5 4-6 4-8.5 0-1.4-1-2-1.8-1.2C4.8 11.8 6 16 9 16.5c2 .3 3-2.5 4.5-2.5s1 3 2.5 3c1 0 1.8-1 2.5-2"/><path d="M4 21h16"/>',
    nube: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.8 8 4.5 4.5 0 0 1 17 18.5z"/>',
    telefono: '<path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
    mensaje: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    ubicacion: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    espera: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    documento: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 15.5h6"/>',
    alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17v.2"/>',
    ver: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    imagen: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4"/>',
    papelera: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
    regla: '<path d="m3.5 15.5 12-12 5 5-12 12z"/><path d="m7 12 2 2M10 9l1.5 1.5M13 6l2 2"/>',
    mano: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5V4.5a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v8.5c0 4-2.5 6.5-6 6.5-2.5 0-4-1.3-5.4-3.5L4 14a1.5 1.5 0 0 1 2.5-1.6z"/>',
    casa: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  };
  const MAPA = {
    "👤": "cliente", "👥": "clientes", "📝": "parte", "📐": "plano", "📦": "material", "📨": "correo", "✉": "correo",
    "📊": "estadisticas", "⚙": "ajustes", "👷": "tecnico", "🔗": "enlace", "🔔": "aviso", "✅": "ok", "🔧": "revision",
    "📋": "lista", "📷": "camara", "✍": "firma", "☁": "nube", "📞": "telefono", "💬": "mensaje", "📍": "ubicacion",
    "📅": "calendario", "⏳": "espera", "📄": "documento", "⚠": "alerta", "👀": "ver", "👁": "ver", "🖼": "imagen",
    "🗑": "papelera", "📏": "regla", "✋": "mano", "⌂": "casa",
  };
  const NOMBRE = { casa: "Inicio", camara: "Foto", telefono: "Llamar", mensaje: "WhatsApp", correo: "Correo", papelera: "Borrar",
    ubicacion: "Ubicación", ajustes: "Ajustes", aviso: "Avisos", enlace: "Enlace", imagen: "Imagen", firma: "Firmar" };
  const RE = new RegExp("(" + Object.keys(MAPA).join("|") + ")\\uFE0F?", "g");
  const svg = (n) => '<svg class="emo" data-i="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + "</svg>";
  const SALTAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, TITLE: 1, svg: 1, SVG: 1, CANVAS: 1 };

  function cambiarTexto(t) {
    const p = t.parentNode; if (!p || SALTAR[p.nodeName] || p.closest && p.closest("svg,[contenteditable],[data-sin-iconos]")) return;
    const s = t.nodeValue; RE.lastIndex = 0; if (!RE.test(s)) return;
    if (p.nodeName === "OPTION") { t.nodeValue = s.replace(RE, "").replace(/^\s+/, ""); return; }
    const span = document.createElement("span"); span.className = "emo-tx";
    span.innerHTML = s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(RE, (_, e) => svg(MAPA[e]));
    // Si el contenedor solo tenía el emoji, se queda solo el icono
    p.replaceChild(span, t);
    if (span.childNodes.length === 1) p.replaceChild(span.firstChild, span);
    // Un botón o enlace que solo tenía el emoji conserva un nombre para los lectores de pantalla
    const b = p.closest && p.closest("a,button");
    if (b && !b.textContent.trim() && !b.getAttribute("aria-label") && !b.title) {
      const i = b.querySelector("svg.emo"); if (i) b.setAttribute("aria-label", NOMBRE[i.dataset.i] || "");
    }
  }
  function recorrer(raiz) {
    if (raiz.nodeType === 3) return cambiarTexto(raiz);
    if (raiz.nodeType !== 1 || SALTAR[raiz.nodeName]) return;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), lista = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) lista.push(n);
    lista.forEach(cambiarTexto);
  }
  let pendientes = [], programado = false;
  function procesar() { programado = false; const l = pendientes; pendientes = []; l.forEach(recorrer); }
  function arrancar() {
    // Tamaño base de los iconos también en páginas sin tema.css (presupuesto público y formulario de contacto)
    if (!document.getElementById("emo-css")) {
      const st = document.createElement("style"); st.id = "emo-css";
      st.textContent = ".emo{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;flex:none}";
      document.head.prepend(st);
    }
    recorrer(document.body);
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") pendientes.push(m.target);
        else m.addedNodes.forEach((n) => pendientes.push(n));
      }
      if (pendientes.length && !programado) { programado = true; requestAnimationFrame(procesar); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.BornaIconos = { svg: (n) => (P[n] ? svg(n) : ""), recorrer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();
})();
