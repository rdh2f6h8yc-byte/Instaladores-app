// Borna · vista 3D del plano. Sin librerías: dibuja en un canvas con perspectiva y orden por profundidad.
// Paredes con su grosor y huecos de puertas y ventanas, escaleras, pilares, símbolos a su altura real y cables.
(function () {
  "use strict";
  const HUECO = { // a qué alturas no hay pared: [desde, hasta] en metros
    puerta: [0, 2.1], corredera: [0, 2.1], puerta2: [0, 2.1], hueco: [0, 2.1], ventana: [0.9, 2.1],
  };
  const TECHO = { luz: 1, luzc: 1, foco: 1, led: 1, pantalla: 1, colgante: 1, ap: 1, humo: 1, gas: 1, pir: 1, altavoz: 1, domo: 1, sirena: 0 };
  // Altura de cada símbolo (m). «t» = en el techo. «c» = encima del tejado.
  const ALT = {
    enchufe: .3, doble: .3, estanco: .3, usb: .3, triple: .3, sai: .3, t25: .5, tri: .5, encimera: 1.1, suelo: .02,
    aplique: 1.9, exterior: 2.2, emerg: 2.2, proyector: 2.4, baliza: .4,
    inter: 1.1, conm: 1.1, cruce: 1.1, puls: 1.1, persiana: 1.1, inter2: 1.1, regulador: 1.1, interest: 1.1, piloto: 1.1,
    timbre: 2, termostato: 1.5,
    cuadro: 1.6, subcuadro: 1.6, cgp: 1.2, contador: 1.5, caja: 2.2, tierra: .1, horno: .9, vitro: .9, lavadora: .5, lavavaj: .5,
    secadora: .5, termo: 1.8, aa: 2.2, extractor: 2.2, ve: 1.2, linea: 1, subida: 2.2, frigo: .5, bomba: .5,
    split: 2.2, exterior_aa: .5, radiador: .5, toallero: 1.2, aero: 1, caldera: 1.5, inversor: 1.5, bateria: 1,
    tv: .5, rj45: .3, tf: .3, ptro: .3, router: 1, switch: 1, pau: 1.6, rack: 1, ptel: 1.5, abrep: 1.1, lector: 1.3,
    alarma: 1.6, teclado: 1.5, magnetico: 2, pulsinc: 1.4, extintor: 1.2, camara: 2.4, sirena: 2.4,
  };
  const ARRIBA = { starlink: 1, antena: 1, placas: 1 };
  const SIN_3D = { texto: 1, puerta: 1, corredera: 1, puerta2: 1, hueco: 1, ventana: 1, escalera: 1, pilar: 1 };

  let o = null; // estado de la vista abierta

  function abrir(cfg) {
    cerrar();
    const pl = cfg.planta, alto = +(pl.alto || 2.5);
    const raiz = document.createElement("div");
    raiz.className = "v3d";
    raiz.innerHTML = `
      <div class="v3d-cab"><b>Vista 3D · ${esc(pl.nombre || "Planta")}</b>
        <button class="v3d-x" aria-label="Cerrar vista 3D">×</button></div>
      <canvas></canvas>
      <div class="v3d-ayuda">Arrastra para girar · pellizca para acercar · dos dedos para mover</div>
      <div class="v3d-vacio" hidden>Dibuja paredes en el plano para verlas en 3D.</div>
      <div class="v3d-bar">
        <button data-o="bajas">Paredes bajas</button>
        <button data-o="simb" class="on">Símbolos</button>
        <button data-o="cables">Cables</button>
        <button data-o="arriba">Desde arriba</button>
        <button data-o="centrar">Centrar</button>
        <span class="v3d-alto">Techo <button data-o="a-">−</button><b>${fmt(alto)} m</b><button data-o="a+">+</button></span>
      </div>`;
    document.body.appendChild(raiz);
    const cv = raiz.querySelector("canvas");
    o = { cfg, pl, raiz, cv, cx: cv.getContext("2d"), alto, bajas: false, simb: true, cables: false,
      yaw: -0.6, pitch: 0.75, dist: 12, tx: 0, tz: 0, imgs: {}, punteros: new Map(), sucio: true };
    o.caja = limites(pl);
    raiz.querySelector(".v3d-vacio").hidden = !!pl.paredes.length || !!pl.items.length;
    centrar();
    raiz.querySelector(".v3d-x").onclick = cerrar;
    raiz.querySelector(".v3d-bar").onclick = (e) => {
      const b = e.target.closest("[data-o]"); if (!b) return; const k = b.dataset.o;
      if (k === "bajas" || k === "simb" || k === "cables") { o[k] = !o[k]; b.classList.toggle("on", o[k]); }
      else if (k === "arriba") { o.pitch = 1.5; o.yaw = 0; }
      else if (k === "centrar") centrar();
      else if (k === "a-" || k === "a+") {
        o.alto = Math.min(6, Math.max(2, Math.round((o.alto + (k === "a+" ? .1 : -.1)) * 10) / 10));
        raiz.querySelector(".v3d-alto b").textContent = fmt(o.alto) + " m";
        if (cfg.alCambiarAlto) cfg.alCambiarAlto(o.alto);
      }
      pintar();
    };
    gestos(cv);
    o.alRedim = () => { o.sucio = true; pintar(); };
    addEventListener("resize", o.alRedim);
    o.esc = (e) => { if (e.key === "Escape") cerrar(); };
    addEventListener("keydown", o.esc);
    // Imágenes de los símbolos (el mismo dibujo que en el plano)
    for (const it of pl.items) if (!SIN_3D[it.t]) imagen(it);
    pintar();
  }

  function cerrar() {
    if (!o) return;
    removeEventListener("resize", o.alRedim); removeEventListener("keydown", o.esc);
    o.raiz.remove(); o = null;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v) => v.toFixed(2).replace(".", ",");

  function limites(pl) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    const add = (x, y) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); };
    for (const w of pl.paredes) { add(w.x1, w.y1); add(w.x2, w.y2); }
    for (const it of pl.items) add(it.x, it.y);
    if (a > c) return { x: 0, y: 0, w: 6, h: 6 };
    return { x: a, y: b, w: Math.max(c - a, 1), h: Math.max(d - b, 1) };
  }
  function centrar() {
    const k = o.caja; o.tx = k.x + k.w / 2; o.tz = k.y + k.h / 2;
    o.dist = Math.max(5, Math.hypot(k.w, k.h) * 1.2 + 2); o.yaw = -0.6; o.pitch = 0.75;
  }

  function imagen(it) {
    const d = (o.cfg.T[it.t] || {}), clave = it.t + "|" + (it.txt || "");
    if (o.imgs[clave]) return o.imgs[clave];
    const txt = it.txt || d.box || "";
    const ancho = d.box ? Math.max(.62, .22 + txt.length * .085) : ["pantalla", "split", "placas", "radiador", "triple", "led"].includes(it.t) ? .86 : .62, alto = .5;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ancho / 2} ${-alto / 2} ${ancho} ${alto}" width="${Math.round(ancho * 260)}" height="${Math.round(alto * 260)}">` +
      `<rect x="${-ancho / 2 + .015}" y="${-alto / 2 + .015}" width="${ancho - .03}" height="${alto - .03}" rx=".08" fill="#fff" fill-opacity=".94" stroke="#161616" stroke-opacity=".3" stroke-width=".012"/>` +
      o.cfg.simbolo({ ...it, x: 0, y: 0, r: 0, f: 0 }) + "</svg>";
    const im = new Image(); im.onload = () => pintar();
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    o.imgs[clave] = { im, ancho, alto };
    return o.imgs[clave];
  }

  // ---------- Geometría ----------
  function paredMasCercana(p, pl) {
    let mejor = null;
    for (const w of pl.paredes) {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy; if (L2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / L2));
      const qx = w.x1 + t * dx, qy = w.y1 + t * dy, d = Math.hypot(p.x - qx, p.y - qy);
      if (!mejor || d < mejor.d) mejor = { w, d, qx, qy, t, L: Math.sqrt(L2), dx, dy };
    }
    return mejor;
  }

  function construir() {
    const pl = o.pl, H = o.bajas ? Math.min(1.1, o.alto) : o.alto, caras = [], extra = [];
    const caja = (cx, cz, ux, uz, a0, a1, g, y0, y1, color) => { // a lo largo de (ux,uz) de a0 a a1, grosor g
      if (a1 - a0 < .005 || y1 - y0 < .005) return;
      const nx = -uz * g / 2, nz = ux * g / 2;
      const P = (a, s, y) => [cx + ux * a + nx * s, y, cz + uz * a + nz * s];
      const v = [P(a0, -1, y0), P(a1, -1, y0), P(a1, 1, y0), P(a0, 1, y0), P(a0, -1, y1), P(a1, -1, y1), P(a1, 1, y1), P(a0, 1, y1)];
      const f = (i, n) => caras.push({ p: i.map((k) => v[k]), n, color });
      f([4, 5, 6, 7], [0, 1, 0]); f([0, 3, 2, 1], [0, -1, 0]);
      f([0, 1, 5, 4], [uz, 0, -ux]); f([2, 3, 7, 6], [-uz, 0, ux]);
      f([1, 2, 6, 5], [ux, 0, uz]); f([3, 0, 4, 7], [-ux, 0, -uz]);
    };
    // Paredes, con huecos de puertas y ventanas
    const huecosDe = new Map();
    for (const it of pl.items) {
      if (!HUECO[it.t]) continue;
      const q = paredMasCercana(it, pl); if (!q || q.d > (q.w.g || .12) / 2 + .2) continue;
      const w = it.w || (o.cfg.T[it.t] || {}).w || .8, s = q.t * q.L;
      if (!huecosDe.has(q.w)) huecosDe.set(q.w, []);
      huecosDe.get(q.w).push({ a0: s - w / 2, a1: s + w / 2, y0: HUECO[it.t][0], y1: HUECO[it.t][1], t: it.t });
    }
    for (const w of pl.paredes) {
      const dx = w.x2 - w.x1, dz = w.y2 - w.y1, L = Math.hypot(dx, dz); if (L < .01) continue;
      const ux = dx / L, uz = dz / L, g = w.g || .12, hs = huecosDe.get(w) || [];
      const cortes = [-g / 2, L + g / 2];
      for (const h of hs) cortes.push(Math.max(-g / 2, h.a0), Math.min(L + g / 2, h.a1));
      cortes.sort((a, b) => a - b);
      for (let i = 0; i < cortes.length - 1; i++) {
        const a0 = cortes[i], a1 = cortes[i + 1]; if (a1 - a0 < .005) continue;
        const m = (a0 + a1) / 2, tapan = hs.filter((h) => m > h.a0 && m < h.a1);
        // tramos verticales sólidos = [0,H] menos los huecos que cubren este tramo
        let tramos = [[0, H]];
        for (const h of tapan) tramos = tramos.flatMap(([y0, y1]) => [[y0, Math.min(y1, h.y0)], [Math.max(y0, h.y1), y1]]).filter(([y0, y1]) => y1 - y0 > .005);
        for (const [y0, y1] of tramos) caja(w.x1, w.y1, ux, uz, a0, a1, g, y0, y1, [236, 232, 222]);
        for (const h of tapan) if (h.t === "ventana" && h.y0 < H) // cristal
          extra.push({ cristal: true, p: [[w.x1 + ux * a0, h.y0, w.y1 + uz * a0], [w.x1 + ux * a1, h.y0, w.y1 + uz * a1], [w.x1 + ux * a1, Math.min(h.y1, H), w.y1 + uz * a1], [w.x1 + ux * a0, Math.min(h.y1, H), w.y1 + uz * a0]] });
      }
    }
    // Escaleras y pilares
    for (const it of pl.items) {
      const r = (it.r || 0) * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r), vx = -uz, vz = ux;
      if (it.t === "pilar") { const w = it.w || .3; caja(it.x - vx * 0, it.y, vx, vz, -w / 2, w / 2, w, 0, H, [190, 186, 176]); }
      if (it.t === "escalera") {
        const w = it.w || 1, n = 8, lng = 2.4, alto = o.alto;
        for (let i = 0; i < n; i++) { // sube hacia -y local
          const a0 = lng / 2 - (i + 1) * lng / n, a1 = lng / 2 - i * lng / n;
          caja(it.x, it.y, vx, vz, a0, a1, w, 0, Math.min(H + .4, (i + 1) * alto / n), [214, 208, 196]);
        }
      }
    }
    // Símbolos
    const simb = [];
    if (o.simb) for (const it of pl.items) {
      if (SIN_3D[it.t]) continue;
      let x = it.x, z = it.y, y, enPared = null;
      if (ARRIBA[it.t]) y = o.alto + .35;
      else if (TECHO[it.t] || ALT[it.t] === undefined) y = o.alto - .02;
      else y = Math.min(ALT[it.t], o.alto - .05);
      if (!TECHO[it.t] && !ARRIBA[it.t]) {
        const q = paredMasCercana(it, pl);
        if (q && q.d < .45) { // pegado a la cara de la pared que mira al símbolo
          let nx = -q.dy / q.L, nz = q.dx / q.L; if ((it.x - q.qx) * nx + (it.y - q.qy) * nz < 0) { nx = -nx; nz = -nz; }
          const g = (q.w.g || .12) / 2 + .03; x = q.qx + nx * g; z = q.qy + nz * g; enPared = true;
        }
      }
      simb.push({ it, p: [x, y, z], enPared });
    }
    // Cables (por el techo, como se suelen tender)
    const cab = [];
    if (o.cables) for (const c of pl.cables) {
      const col = (o.cfg.circuitos.find((k) => k.id === c.c) || {}).c || "#5C5A55";
      const y = Math.max(.1, (o.bajas ? H : o.alto) - .06);
      cab.push({ a: [c.x1, y, c.y1], b: [c.x2, y, c.y2], col });
    }
    return { caras, extra, simb, cab, H };
  }

  // ---------- Cámara y dibujo ----------
  function pintar() { if (o && !o.raf) o.raf = requestAnimationFrame(() => { o.raf = 0; dibujar(); }); }

  function dibujar() {
    const cv = o.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, Hc = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hc * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hc * dpr); }
    const cx = o.cx; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // cielo
    const gr = cx.createLinearGradient(0, 0, 0, Hc); gr.addColorStop(0, "#F7F5EF"); gr.addColorStop(1, "#E6E2D8");
    cx.fillStyle = gr; cx.fillRect(0, 0, W, Hc);

    const cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
    const ojo = [o.tx + o.dist * cp * Math.sin(o.yaw), o.dist * sp, o.tz + o.dist * cp * Math.cos(o.yaw)];
    const f = norm([o.tx - ojo[0], -ojo[1], o.tz - ojo[2]]);
    let r = norm(cruz(f, [0, 1, 0])); if (!isFinite(r[0])) r = [1, 0, 0];
    const u = cruz(r, f), F = Math.min(W, Hc) * 1.1, mx = W / 2, my = Hc / 2;
    const vista = (p) => { const v = [p[0] - ojo[0], p[1] - ojo[1], p[2] - ojo[2]]; return [punto(v, r), punto(v, u), punto(v, f)]; };
    const proy = (q) => [mx + q[0] * F / q[2], my - q[1] * F / q[2]];
    const CERCA = .15;

    const g = construir();
    // suelo
    const k = o.caja, m = 1.2;
    const suelo = [[k.x - m, 0, k.y - m], [k.x + k.w + m, 0, k.y - m], [k.x + k.w + m, 0, k.y + k.h + m], [k.x - m, 0, k.y + k.h + m]];
    poligono(cx, recortar(suelo.map(vista), CERCA).map(proy), "#FBFAF6", "#D8D3C6");
    // rejilla de metro en el suelo
    cx.strokeStyle = "rgba(22,22,22,.06)"; cx.lineWidth = 1;
    for (let x = Math.ceil(k.x - m); x <= k.x + k.w + m; x++) linea3d(cx, vista, proy, [x, 0, k.y - m], [x, 0, k.y + k.h + m], CERCA);
    for (let z = Math.ceil(k.y - m); z <= k.y + k.h + m; z++) linea3d(cx, vista, proy, [k.x - m, 0, z], [k.x + k.w + m, 0, z], CERCA);

    const L = norm([-.45, .8, -.35]), lista = [];
    for (const c of g.caras) {
      const cen = media(c.p), dirOjo = [cen[0] - ojo[0], cen[1] - ojo[1], cen[2] - ojo[2]];
      if (punto(dirOjo, c.n) >= 0) continue; // cara de espaldas
      const vs = c.p.map(vista), prof = vs.reduce((s, q) => s + q[2], 0) / vs.length;
      const luz = .62 + .38 * Math.max(0, punto(c.n, L)), arriba = c.n[1] > .5;
      const col = c.color.map((v) => Math.round(v * (arriba ? 1.04 : luz)));
      lista.push({ prof, dib: () => poligono(cx, recortar(vs, CERCA).map(proy), arriba ? "#3A3833" : `rgb(${col})`, "rgba(22,22,22,.18)") });
    }
    for (const c of g.extra) {
      const vs = c.p.map(vista), prof = vs.reduce((s, q) => s + q[2], 0) / vs.length;
      lista.push({ prof, dib: () => poligono(cx, recortar(vs, CERCA).map(proy), "rgba(120,180,230,.35)", "rgba(30,90,150,.5)") });
    }
    for (const c of g.cab) {
      const a = vista(c.a), b = vista(c.b);
      lista.push({ prof: (a[2] + b[2]) / 2 - .05, dib: () => { cx.strokeStyle = c.col; cx.lineWidth = 2.5; cx.setLineDash([7, 5]); linea3d(cx, vista, proy, c.a, c.b, CERCA); cx.setLineDash([]); } });
    }
    for (const s of g.simb) {
      const q = vista(s.p); if (q[2] < CERCA * 2) continue;
      const im = imagen(s.it), pix = Math.max(26, Math.min(96, .5 * F / q[2])), w = pix * im.ancho / im.alto, h = pix;
      const [px, py] = proy(q);
      lista.push({ prof: q[2] - .2, dib: () => {
        // patita hasta el suelo o la pared para situarlo
        const base = vista([s.p[0], s.enPared ? s.p[1] : 0, s.p[2]]);
        if (!s.enPared && base[2] > CERCA) { const [bx, by] = proy(base); cx.strokeStyle = "rgba(22,22,22,.25)"; cx.lineWidth = 1; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(px, py); cx.lineTo(bx, by); cx.stroke(); cx.setLineDash([]); }
        cx.fillStyle = "#161616"; cx.beginPath(); cx.arc(px, py, 2.5, 0, 6.3); cx.fill();
        if (im.im.complete && im.im.naturalWidth) cx.drawImage(im.im, px - w / 2, py - h - 6, w, h);
      } });
    }
    lista.sort((a, b) => b.prof - a.prof).forEach((x) => x.dib());
  }

  function linea3d(cx, vista, proy, a, b, cerca) {
    let p = vista(a), q = vista(b);
    if (p[2] < cerca && q[2] < cerca) return;
    if (p[2] < cerca) p = corte(p, q, cerca); else if (q[2] < cerca) q = corte(q, p, cerca);
    const A = proy(p), B = proy(q); cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]); cx.stroke();
  }
  const corte = (p, q, c) => { const t = (c - p[2]) / (q[2] - p[2]); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, c]; };
  function recortar(vs, c) { // quita lo que queda detrás de la cámara
    const out = [];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length], ina = a[2] >= c, inb = b[2] >= c;
      if (ina) out.push(a); if (ina !== inb) out.push(corte(a, b, c));
    }
    return out;
  }
  function poligono(cx, pts, relleno, borde) {
    if (pts.length < 3) return;
    cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath();
    cx.fillStyle = relleno; cx.fill(); if (borde) { cx.strokeStyle = borde; cx.lineWidth = 1; cx.stroke(); }
  }
  const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const media = (ps) => [0, 1, 2].map((i) => ps.reduce((s, p) => s + p[i], 0) / ps.length);

  // ---------- Gestos: girar, acercar, mover ----------
  function gestos(cv) {
    let ant = null;
    const estado = () => { const ps = [...o.punteros.values()]; if (ps.length === 1) return { n: 1, x: ps[0].x, y: ps[0].y };
      const [a, b] = ps; return { n: 2, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); o.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); ant = estado(); });
    cv.addEventListener("pointermove", (e) => {
      if (!o.punteros.has(e.pointerId)) return;
      o.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); const s = estado();
      if (ant && s.n === ant.n) {
        if (s.n === 1) { o.yaw -= (s.x - ant.x) * .008; o.pitch = Math.min(1.52, Math.max(.08, o.pitch + (s.y - ant.y) * .006)); }
        else {
          o.dist = Math.min(80, Math.max(2, o.dist * ant.d / Math.max(10, s.d)));
          const k = o.dist / 600, dx = (s.x - ant.x) * k, dy = (s.y - ant.y) * k;
          // mover el centro por el suelo: derecha de la cámara (cos, -sin) y adelante (-sin, -cos)
          o.tx += -Math.cos(o.yaw) * dx - Math.sin(o.yaw) * dy;
          o.tz += Math.sin(o.yaw) * dx - Math.cos(o.yaw) * dy;
        }
        pintar();
      }
      ant = s;
    });
    const soltar = (e) => { o && o.punteros.delete(e.pointerId); ant = o && o.punteros.size ? estado() : null; };
    cv.addEventListener("pointerup", soltar); cv.addEventListener("pointercancel", soltar);
    cv.addEventListener("wheel", (e) => { e.preventDefault(); o.dist = Math.min(80, Math.max(2, o.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1))); pintar(); }, { passive: false });
  }

  window.Vista3D = { abrir, cerrar };
})();
